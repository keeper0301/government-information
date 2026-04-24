// ============================================================
// korea.kr "키워드 뉴스" 카테고리 수집 — 15개 주제 분류
// ============================================================
// customizedNewsList.do 페이지가 대상별(6) + 주제별(6) + 핫이슈(3) 총 15개
// 카테고리로 뉴스를 분류해 제공. RSS 수집기 (korea-kr.ts) 와는 별개 경로 —
// RSS 는 부처별(보건복지부·고용노동부 등) 분류라 사용자 관점의 "청년·대학생",
// "소상공인 지원" 같은 주제 분류는 이 수집기에서 채워 넣음.
//
// 동작
//   1) 15개 카테고리마다 `customizedNewsList.do?subPkgId={id}&keyType={KW}&pageIndex=1`
//      GET 요청 → 서버 렌더링 HTML 응답 (카테고리당 약 30~127건, 페이지당 30건)
//   2) HTML 에서 newsId·title·summary·thumbnail·published_at 파싱
//   3) 기존 news_posts 에 upsert — slug 충돌 시 topic_categories 만 병합
//      (같은 뉴스가 "청년·대학생" + "일자리" 에 동시 속하면 둘 다 배열에 추가)
//
// 공공누리 제1유형 라이선스 — korea.kr 자료는 출처표시 후 재배포 가능.
// 썸네일은 재호스팅 금지라 URL 그대로 보존.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWithTimeout } from "@/lib/collectors";
import { cleanDescription } from "@/lib/utils";
import { extractNewsKeywords } from "@/lib/news-keywords";
import { extractBenefitTags } from "@/lib/tags/taxonomy";

type CategoryAxis = "target" | "topic" | "hot";

type Category = {
  id: string;         // korea.kr subPkgId (예: "25000074")
  name: string;       // 사용자 노출 라벨 (예: "영유아·아동·청소년")
  axis: CategoryAxis; // UI 그룹핑용
  keyType: "KW01" | "KW02" | "KW03";
};

// 15개 카테고리 — 사장님 2026-04-24 요청 기준. "안전"·"보이스피싱"·"5극3특"·
// "여행" 은 keepioo 도메인과 어긋나 제외.
export const TOPIC_CATEGORIES: Category[] = [
  // 대상별 (KW01)
  { id: "25000074", name: "영유아·아동·청소년", axis: "target", keyType: "KW01" },
  { id: "25000075", name: "청년·대학생", axis: "target", keyType: "KW01" },
  { id: "25000106", name: "가족·중장년", axis: "target", keyType: "KW01" },
  { id: "25000077", name: "어르신", axis: "target", keyType: "KW01" },
  { id: "25000078", name: "소득 취약계층", axis: "target", keyType: "KW01" },
  { id: "25000120", name: "장애인", axis: "target", keyType: "KW01" },
  // 주제별 (KW02)
  { id: "25000068", name: "일자리", axis: "topic", keyType: "KW02" },
  { id: "25000069", name: "주거", axis: "topic", keyType: "KW02" },
  { id: "25000070", name: "교육·보육", axis: "topic", keyType: "KW02" },
  { id: "25000071", name: "복지", axis: "topic", keyType: "KW02" },
  { id: "25000072", name: "문화", axis: "topic", keyType: "KW02" },
  { id: "25000131", name: "근로자·소상공인·중소기업", axis: "topic", keyType: "KW02" },
  // 핫이슈 (KW03)
  { id: "70020412", name: "문화가 있는 날", axis: "hot", keyType: "KW03" },
  { id: "70023981", name: "소상공인 지원", axis: "hot", keyType: "KW03" },
  { id: "70022018", name: "청년정책", axis: "hot", keyType: "KW03" },
];

// 카테고리명 → slug (URL 용). "청년·대학생" → "youth-college" 식의 영문 slug
// 매핑은 lib/news-topic-slug.ts 에서 관리.

const BASE_URL = "https://www.korea.kr/news/customizedNewsList.do";

type ParsedItem = {
  newsId: string;
  title: string;
  summary: string | null;
  body: string | null;
  thumbnailUrl: string | null;
};

// 신규 뉴스 insert 시 title + source_id 를 합친 결정론적 slug 생성.
// korea-kr.ts 의 deterministicSlug 과 동일 규칙 — 동일 뉴스가 두 수집기에
// 의해 들어와도 같은 slug 생성 → upsert onConflict 로 병합.
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

// HTML 에서 뉴스 카드 리스트 파싱. 실제 구조:
//   <li>
//     <a href="/news/customizedNewsView.do?newsId=148962831&keyType=KW01">
//       <span class="thumb"><img src="..."/></span>
//       <span class="text">
//         <strong>
//           <span class="category">청년·대학생</span>
//           제목 텍스트
//         </strong>
//         <span class="lead">요약 텍스트</span>
//       </span>
//     </a>
//   </li>
// 인기뉴스 사이드바(visualNewsView.do) 는 다른 구조라 href 가
// customizedNewsView.do 인 것만 매칭해 혼입 방지.
function parseNewsList(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const cardRe =
    /<a[^>]+href="\/news\/customizedNewsView\.do\?newsId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const newsId = m[1];
    const block = m[2];

    // 제목 — <strong>…</strong> 안에서 <span class="category"> 을 제거한 나머지 텍스트
    const strongMatch = block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/);
    if (!strongMatch) continue;
    const titleRaw = strongMatch[1].replace(
      /<span[^>]*class="category"[^>]*>[^<]*<\/span>/,
      "",
    );
    const title = cleanDescription(titleRaw).trim();

    // 본문 — <span class="lead">…</span> 에는 기사 전문 수준의 긴 텍스트가 들어옴.
    //   body: 전체를 그대로 저장 (상세 페이지 본문용)
    //   summary: 앞 200자 (목록 카드용 — korea-kr.ts 와 동일 규칙)
    const leadMatch = block.match(/<span[^>]*class="lead"[^>]*>([\s\S]*?)<\/span>/);
    const body = leadMatch ? cleanDescription(leadMatch[1]).trim() : null;
    const summary = body ? body.slice(0, 200) : null;

    // 썸네일 — 카드 내 첫 의미있는 <img> (인기뉴스 순위 아이콘 등 제외)
    const thumbMatch = block.match(/<img[^>]+src=["']([^"']+)["']/);
    const thumb = thumbMatch ? thumbMatch[1] : null;
    const thumbnailUrl =
      thumb && /^https?:/i.test(thumb) && !/btn_|icon_|default/i.test(thumb)
        ? thumb
        : null;

    if (newsId && title) {
      items.push({ newsId, title, summary, body, thumbnailUrl });
    }
  }
  return items;
}

// 단일 카테고리 fetch (페이지 1 기본). Vercel 60초 maxDuration 고려해
// 카테고리당 1페이지(최대 30건) 로 제한 — 매일 cron 누적이면 충분.
async function fetchCategory(cat: Category): Promise<ParsedItem[]> {
  const url = `${BASE_URL}?subPkgId=${cat.id}&keyType=${cat.keyType}&pageIndex=1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 keepioo-bot (+https://www.keepioo.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseNewsList(html);
}

// 15개 카테고리 병렬 수집 → news_posts 에 신규 upsert + 기존 뉴스에 카테고리 병합.
// 같은 newsId 가 여러 카테고리에 속하면 topic_categories 배열에 모두 추가.
// slug 매칭은 source_id 기준 — RSS 수집기(korea-kr.ts)와 같은 newsId 체계.
// slug 는 deterministicSlug 공통 규칙으로 생성해 RSS·topics 두 경로가 같은
// 뉴스에 들어와도 중복 row 안 생김 (onConflict: slug).
export async function collectKoreaKrTopics(): Promise<{
  categories: number;
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  breakdown: Record<string, number>;
}> {
  const supabase = createAdminClient();

  const results = await Promise.allSettled(
    TOPIC_CATEGORIES.map(async (cat) => ({
      cat,
      items: await fetchCategory(cat),
    })),
  );

  // newsId → 이 뉴스가 속한 카테고리명 목록
  const newsIdToTopics = new Map<string, Set<string>>();
  // newsId → 파싱된 뉴스 데이터 (신규 insert 시 필요)
  const newsIdToItem = new Map<string, ParsedItem>();
  const breakdown: Record<string, number> = {};
  let errors = 0;

  for (const r of results) {
    if (r.status !== "fulfilled") {
      errors++;
      continue;
    }
    const { cat, items } = r.value;
    breakdown[cat.name] = items.length;
    for (const it of items) {
      const set = newsIdToTopics.get(it.newsId) ?? new Set();
      set.add(cat.name);
      newsIdToTopics.set(it.newsId, set);
      // 여러 카테고리에서 동일 newsId 가 들어오면 첫 item 유지 (제목·본문 동일)
      if (!newsIdToItem.has(it.newsId)) newsIdToItem.set(it.newsId, it);
    }
  }

  const allIds = Array.from(newsIdToTopics.keys());
  if (allIds.length === 0) {
    return {
      categories: TOPIC_CATEGORIES.length,
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors,
      breakdown,
    };
  }

  // 기존 row 조회 — 어떤 newsId 가 이미 DB 에 있는지 파악
  const { data: existing } = await supabase
    .from("news_posts")
    .select("id, source_id, topic_categories")
    .in("source_id", allIds);

  const existingIds = new Set((existing ?? []).map((r) => r.source_id));
  const newIds = allIds.filter((id) => !existingIds.has(id));

  // 1) 기존 뉴스 — topic_categories 배열만 병합 업데이트
  let updated = 0;
  await Promise.all(
    (existing ?? []).map(async (row) => {
      const newSet = newsIdToTopics.get(row.source_id);
      if (!newSet || newSet.size === 0) return;

      const existingArr: string[] = Array.isArray(row.topic_categories)
        ? row.topic_categories
        : [];
      const merged = Array.from(new Set([...existingArr, ...newSet])).sort();
      const existingSorted = [...existingArr].sort();

      if (
        merged.length === existingSorted.length &&
        merged.every((t, i) => t === existingSorted[i])
      ) {
        return; // 변경 없음 — updated_at 오염 방지
      }

      const { error } = await supabase
        .from("news_posts")
        .update({ topic_categories: merged })
        .eq("id", row.id);

      if (!error) updated++;
    }),
  );

  // 2) 신규 뉴스 — news_posts 에 upsert. 주제 분류 수집기가 유일한 소스.
  //    published_at 은 HTML 에 없어 now() fallback — 이후 RSS 가 같은 newsId 를
  //    수집하면 slug 충돌로 ignoreDuplicates 되지만 RSS 가 더 정확한 published_at
  //    을 가지므로 신규 수집 뉴스의 날짜 정확도는 아쉬운 면이 있음.
  //    (korea.kr 키워드 뉴스 페이지는 카드 HTML 에 날짜 노출이 없음)
  const nowIso = new Date().toISOString();
  const payload = newIds
    .map((id) => {
      const item = newsIdToItem.get(id);
      if (!item) return null;
      const topics = Array.from(newsIdToTopics.get(id) ?? []).sort();
      const textBlob = [item.title, item.body ?? ""].join(" ");
      return {
        source_code: "korea-kr-topics",
        source_id: id,
        source_url: `https://www.korea.kr/news/customizedNewsView.do?newsId=${id}`,
        category: "news",
        ministry: null,
        title: item.title,
        summary: item.summary,
        body: item.body,
        thumbnail_url: item.thumbnailUrl,
        slug: deterministicSlug(item.title, id),
        benefit_tags: extractBenefitTags(textBlob),
        keywords: extractNewsKeywords([item.title, item.body ?? ""]),
        topic_categories: topics,
        published_at: nowIso,
        updated_at: nowIso,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  let inserted = 0;
  if (payload.length > 0) {
    const { data: insertedRows, error } = await supabase
      .from("news_posts")
      .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");
    if (!error) inserted = insertedRows?.length ?? 0;
  }

  return {
    categories: TOPIC_CATEGORIES.length,
    fetched: allIds.length,
    inserted,
    updated,
    errors,
    breakdown,
  };
}
