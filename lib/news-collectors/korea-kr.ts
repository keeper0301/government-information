// ============================================================
// korea.kr RSS 수집 — 부처별 뉴스 + 정책자료
// ============================================================
// 6개 RSS 피드 를 매일 1회 fetch 후 news_posts 테이블에 upsert.
// 공공누리 제1유형 (출처표시 + 상업이용·변형 허용) — license 컬럼에 기록.
//
// 2026-04-24 구성 변경 배경:
//   - 기존 policy.xml (정책뉴스 전체) 는 keepioo 와 무관한 외교·안보·순방 등
//     노이즈 다수. 부처 전체 뉴스에서 kr 키워드 필터로 거르는 접근은 수량이
//     적어지고 필터 실패 시 노이즈가 쉽게 노출됨.
//   - korea.kr 이 부처별 RSS 를 `/rss/dept_{code}.xml` 형식으로 제공하는 것을
//     확인 → keepioo 타겟 부처 5개 (복지·고용·중기·국토·성평등) 만 수집.
//     → 소스 수준에서 노이즈 사전 제거 + 수량 5배 확대 (250건).
//
// 수집 피드 목록:
//   1. dept_mw.xml  (보건복지부)   — 복지·의료·아동·노인
//   2. dept_moel.xml (고용노동부)   — 청년·일자리·창업
//   3. dept_mss.xml  (중소벤처기업부) — 소상공인·창업·지원금
//   4. dept_molit.xml (국토교통부)  — 주거·전세·월세
//   5. dept_mogef.xml (성평등가족부) — 출산·육아·한부모
//   6. dept_moe.xml  (교육부)       — 학자금·장학금·학습 (2026-04-24 추가)
//   7. dept_mafra.xml (농림축산식품부) — 농어민 지원 (2026-04-24 추가)
//   8. dept_mcst.xml (문화체육관광부) — 문화바우처·관광지원 (2026-04-24 추가)
//   9. dept_mois.xml (행정안전부)   — 지자체 지원·주민 복지 (2026-04-24 추가)
//  10. expdoc.xml   (정책자료)     — 연감·백서·보고서 (카테고리: policy-doc)
//
// 제외: policy.xml (부처별과 중복 + 노이즈), pressrelease.xml (저품질)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { extractBenefitTags } from "@/lib/tags/taxonomy";
import { extractNewsKeywords } from "@/lib/news-keywords";
import { cleanDescription, stripHtmlTags } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/collectors";

type FeedCategory = "news" | "press" | "policy-doc";

// source_code 는 news_posts 의 unique constraint (source_code, source_id) 키.
// 부처 코드는 korea.kr URL 의 dept_{code}.xml 에서 따와 접두사 korea-kr- 붙임.
type Feed = {
  code: string;
  category: FeedCategory;
  url: string;
  ministry: string;
};

const FEEDS: Feed[] = [
  {
    code: "korea-kr-dept-mw",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mw.xml",
    ministry: "보건복지부",
  },
  {
    code: "korea-kr-dept-moel",
    category: "news",
    url: "https://www.korea.kr/rss/dept_moel.xml",
    ministry: "고용노동부",
  },
  {
    code: "korea-kr-dept-mss",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mss.xml",
    ministry: "중소벤처기업부",
  },
  {
    code: "korea-kr-dept-molit",
    category: "news",
    url: "https://www.korea.kr/rss/dept_molit.xml",
    ministry: "국토교통부",
  },
  {
    code: "korea-kr-dept-mogef",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mogef.xml",
    ministry: "성평등가족부",
  },
  {
    code: "korea-kr-dept-moe",
    category: "news",
    url: "https://www.korea.kr/rss/dept_moe.xml",
    ministry: "교육부",
  },
  {
    code: "korea-kr-dept-mafra",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mafra.xml",
    ministry: "농림축산식품부",
  },
  {
    code: "korea-kr-dept-mcst",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mcst.xml",
    ministry: "문화체육관광부",
  },
  {
    code: "korea-kr-dept-mois",
    category: "news",
    url: "https://www.korea.kr/rss/dept_mois.xml",
    ministry: "행정안전부",
  },
  {
    code: "korea-kr-expdoc",
    category: "policy-doc",
    url: "https://www.korea.kr/rss/expdoc.xml",
    ministry: "대한민국 정책브리핑",
  },
];

// item 블록에서 CDATA 포함 태그 추출
function parseTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  let raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) raw = cdata[1];
  return raw.length > 0 ? raw : null;
}

// description 의 첫 의미있는 <img src>. RSS 버튼 이미지(btn_textview·icon_logo) 제외.
function extractThumbnail(html: string): string | null {
  const re = /<img[^>]+src=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (!src) continue;
    if (src.includes("btn_textview") || src.includes("icon_logo")) continue;
    if (!/^https?:/i.test(src)) continue;
    return src;
  }
  return null;
}

// "[과기정통부]과기정통부–교육부..." 형식에서 부처명 추출
function extractMinistry(title: string): { ministry: string | null; clean: string } {
  const m = title.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) return { ministry: m[1].trim(), clean: m[2].trim() };
  return { ministry: null, clean: title };
}

// URL 안전 + 결정론적 slug — source_code + source_id 로 충돌·수집시마다 변동 없음.
// title 은 SEO 를 위해 앞에 포함 (한글 URL 지원). 길이 제한으로 잘라냄.
function deterministicSlug(title: string, sourceId: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${base}-${sourceId}`.slice(0, 120);
}

export type KoreaKrItem = {
  source_code: string;
  source_id: string;
  source_url: string;
  category: FeedCategory;
  ministry: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  thumbnail_url: string | null;
  slug: string;
  benefit_tags: string[];
  keywords: string[];
  published_at: string;
};

// RSS 1개 피드 fetch·파싱. Vercel 서버리스에서 korea.kr 동시 병렬 요청 시
// 일시적 "fetch failed" 가 발생 → 1회 재시도로 대부분 복구.
async function fetchFeed(feed: Feed): Promise<KoreaKrItem[]> {
  async function attempt() {
    return fetchWithTimeout(feed.url, {
      timeoutMs: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0 keepioo-bot (+https://www.keepioo.com)",
      },
    });
  }
  let res;
  try {
    res = await attempt();
  } catch (err) {
    // 1.5초 대기 후 재시도 — 일시적 네트워크 오류 대응
    await new Promise((r) => setTimeout(r, 1500));
    res = await attempt().catch(() => {
      throw new Error(
        `${feed.code} fetch failed (retry): ${err instanceof Error ? err.message : err}`,
      );
    });
    if (!res) throw err;
  }
  if (!res.ok) throw new Error(`${feed.code} HTTP ${res.status}`);
  const xml = await res.text();

  const items: KoreaKrItem[] = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const block = m[1];
    // RSS title 은 HTML entity 가 인코딩된 채 들어옴 (&middot; / &quot; / &#xFF65; 등).
    // description 은 cleanDescription() 으로 정제하지만 title 은 그동안 누락 — 사용자 화면에
    // 「온&middot;오프라인」 처럼 노출되던 사고. stripHtmlTags 가 entity 디코드 + 태그 제거
    // + 공백 정리까지 한 줄 title 에 안전 적용.
    const titleRaw = parseTag(block, "title") ?? "";
    const rawTitle = stripHtmlTags(titleRaw);
    const link = parseTag(block, "link") ?? "";
    const descRaw = parseTag(block, "description") ?? "";
    const pubDate = parseTag(block, "pubDate");
    const guid = parseTag(block, "guid") ?? link;

    if (!rawTitle || !link) continue;

    // 제목 앞 [부처명] prefix 가 있으면 그걸 쓰고, 없으면 feed 의 ministry fallback.
    // 부처별 RSS(dept_*.xml) 는 prefix 가 있거나 없거나 항상 해당 부처 뉴스이므로
    // feed.ministry 가 최소 보장치.
    const { ministry: prefixMinistry, clean: title } = extractMinistry(rawTitle);
    const ministry = prefixMinistry || feed.ministry;

    // source_id: newsId / docId 우선, 없으면 guid
    const idMatch = link.match(/newsId=(\d+)|docId=(\d+)/);
    const source_id = idMatch ? (idMatch[1] ?? idMatch[2]) : guid;

    const cleaned = cleanDescription(descRaw);
    const thumbnail = extractThumbnail(descRaw);
    const summary = cleaned.length > 0 ? cleaned.slice(0, 200) : null;

    const publishedDate = pubDate ? new Date(pubDate) : new Date();
    const published_at = Number.isNaN(publishedDate.getTime())
      ? new Date().toISOString()
      : publishedDate.toISOString();

    const textBlob = [title, cleaned].filter(Boolean).join(" ");
    const benefit_tags = extractBenefitTags(textBlob);
    const keywords = extractNewsKeywords([title, cleaned]);

    // 2026-04-24 품질 필터: keepioo 사용자와 무관한 뉴스는 수집 제외.
    // lib/news-keywords.ts 의 26개 keepioo 도메인 키워드(청년·소상공인·지원금·
    // 연금 등)가 하나도 매칭 안 되면 스킵 — 베트남 수출·순방·석유가격 같은
    // 시사 뉴스 노이즈 차단.
    if (keywords.length === 0) continue;

    items.push({
      source_code: feed.code,
      source_id,
      source_url: link,
      category: feed.category,
      ministry,
      title,
      summary,
      body: cleaned.length > 0 ? cleaned : null,
      thumbnail_url: thumbnail,
      slug: deterministicSlug(title, source_id),
      benefit_tags,
      keywords,
      published_at,
    });
  }
  return items;
}

// 전체 feed 수집 + news_posts upsert
// 2026-04-24 순차 → 병렬(Promise.allSettled) 로 개선. 6개 피드 순차는 Vercel
// 60초 maxDuration 내 일부 누락되던 문제 → 전체 시간이 "가장 느린 피드 1개"
// 수준으로 단축. 한 피드 실패해도 다른 피드 정상 처리됨.
export async function collectKoreaKr(): Promise<{
  total: number;
  upserted: number;
  errors: number;
  breakdown: Record<string, number>;
  errorDetails: Record<string, string>;
}> {
  const supabase = createAdminClient();
  let total = 0;
  let upserted = 0;
  let errors = 0;
  const breakdown: Record<string, number> = {};
  // 실패 원인 디버깅용 — 각 feed.code → 실제 에러 메시지.
  const errorDetails: Record<string, string> = {};

  // 모든 피드 병렬 fetch (실패·성공 독립)
  const fetchResults = await Promise.allSettled(
    FEEDS.map((feed) => fetchFeed(feed).then((items) => ({ feed, items }))),
  );

  // 피드별 upsert 도 병렬 (서로 독립적인 DB 작업)
  const upsertResults = await Promise.allSettled(
    fetchResults.map(async (fr, idx) => {
      const feed = FEEDS[idx];
      if (fr.status !== "fulfilled") {
        const msg = fr.reason instanceof Error ? fr.reason.message : String(fr.reason);
        console.error(`[news:${feed.code}] fetch 실패:`, msg);
        throw new Error(`fetch: ${msg}`);
      }
      const items = fr.value.items;
      breakdown[feed.code] = items.length;
      total += items.length;
      if (items.length === 0) return { upserted: 0 };

      const payload = items.map((it) => ({
        source_code: it.source_code,
        source_id: it.source_id,
        source_url: it.source_url,
        category: it.category,
        ministry: it.ministry,
        title: it.title,
        summary: it.summary,
        body: it.body,
        thumbnail_url: it.thumbnail_url,
        slug: it.slug,
        benefit_tags: it.benefit_tags,
        keywords: it.keywords,
        published_at: it.published_at,
        updated_at: new Date().toISOString(),
      }));

      // slug 는 DB 에 unique constraint 가 있음. 부처별 RSS 는 동일 뉴스가
      // 여러 부처에 동시 노출되는 케이스가 있음 (예: 복지부+성평등가족부 공동
      // 발표 → 양쪽 피드에 같은 newsId 로 나타남 → 같은 slug 생성).
      // onConflict 를 slug 로 설정 + ignoreDuplicates: 이미 있으면 건너뛰기.
      // 먼저 들어온 피드가 "첫 번째 승자" — 부처 정보 유지.
      const { data, error } = await supabase
        .from("news_posts")
        .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
        .select("id");

      if (error) {
        console.error(`[news:${feed.code}] upsert 실패:`, error.message);
        throw new Error(`upsert: ${error.message}`);
      }
      return { upserted: data?.length ?? 0 };
    }),
  );

  upsertResults.forEach((ur, idx) => {
    const feed = FEEDS[idx];
    if (ur.status === "fulfilled") {
      upserted += ur.value.upserted;
    } else {
      errors++;
      errorDetails[feed.code] =
        ur.reason instanceof Error ? ur.reason.message : String(ur.reason);
    }
  });

  return { total, upserted, errors, breakdown, errorDetails };
}
