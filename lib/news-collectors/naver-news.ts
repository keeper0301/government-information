// ============================================================
// 네이버 뉴스 검색 API — 전국 시군구 정책 정보 수집
// ============================================================
// 2026-04-25 저장 대상 변경: news_posts 로 일원화.
// 이전(2026-04-24) 에는 welfare_programs / loan_programs 로 직접 저장했으나,
// 신문 기사라 apply_*·target·benefits 가 비어 "프로그램" 처럼 취급하기
// 어색했고, /welfare·/loan 목록에 뉴스가 섞여 공고 품질·detail-fetcher
// 매칭에도 악영향 (전수 23000+ 건이 enrich skipped 원인).
//
// 현재: 모두 news_posts (category='news') 로 통일. /news 목록과 같은
// 수명주기로 관리. 기존 welfare/loan 에 쌓인 과거 수집분은 027 migration
// 으로 news_posts 로 이전.
//
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (네이버 개발자센터 발급)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { extractBenefitTags } from "@/lib/tags/taxonomy";
import { extractNewsKeywords } from "@/lib/news-keywords";
import { cleanDescription } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/collectors";
import { isNewsNoise } from "@/lib/news-filters";
import {
  type ProvinceCode,
  getProvinceByCode,
  getSearchUnitsForProvince,
} from "@/lib/regions";
import { createHash } from "node:crypto";

const CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
const API = "https://openapi.naver.com/v1/search/news.json";

const KEYWORDS = [
  // 혜택성
  "지원금",
  "보조금",
  "장려금",
  "수당",
  "바우처",
  "장학금",
  // 정책 액션
  "모집",
  "공모",
  // 일자리·창업
  "일자리",
  "창업지원",
  "취업지원",
  // 주거
  "임대주택",
  "청년주택",
  "전세대출",
  // 의료
  "의료비",
  // 양육·돌봄
  "출산지원",
  "돌봄",
  // 시민 직접지급
  "민생회복",
];

// classifyAsLoan / mapCategory / mapLoanCategory 는 2026-04-25
// "naver-news → news_posts only" 정책 변경(memory: project_naver_news_to_news_posts)
// 으로 welfare/loan 분기 폐기되며 미사용. dead code 정리 (2026-04-26 헬스체크).

type NaverNewsItem = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

type NaverApiResponse = {
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
};

// 표준화된 1건 — news_posts 에 INSERT 할 payload 준비용.
// news_posts 스키마 (021 migration) 기준 필드 매핑:
//   title/summary/source_url/source_id/source_code/published_at 동일
//   ministry = 광역명 (예: "전라남도")
//   keywords = 도메인 키워드 (기존 extractNewsKeywords 결과)
//   benefit_tags = 혜택 태그 (기존 taxonomy)
type NormalizedItem = {
  source_code: string;
  source_id: string;
  source_url: string;
  ministry: string; // 광역명 (news_posts.ministry)
  title: string;
  summary: string | null;
  keywords: string[];
  benefit_tags: string[];
  published_at: string;
};

// HTML 강조 태그·엔티티 정제.
function stripNaverMarkup(s: string): string {
  return s
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// originallink → 16자 hash. UNIQUE (source_code, source_id) 충돌 방지.
function hashSourceId(originallink: string): string {
  return createHash("sha1").update(originallink).digest("hex").slice(0, 16);
}

// 네이버 뉴스 검색 1회 (searchUnit + keyword).
async function searchOnce(searchUnit: string, keyword: string): Promise<NaverNewsItem[]> {
  const query = `${searchUnit} ${keyword}`;
  const params = new URLSearchParams({
    query,
    display: "20",
    sort: "date",
  });
  const res = await fetchWithTimeout(`${API}?${params}`, {
    timeoutMs: 15000,
    headers: {
      "X-Naver-Client-Id": CLIENT_ID,
      "X-Naver-Client-Secret": CLIENT_SECRET,
      "User-Agent": "keepioo-news-bot/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`naver-news ${searchUnit}+${keyword} HTTP ${res.status}`);
  }
  const data = (await res.json()) as NaverApiResponse;
  return data.items ?? [];
}

// 1광역의 모든 검색 단위 × 키워드 처리 + 표준화.
async function collectProvinceItems(
  provinceCode: ProvinceCode,
  provinceName: string,
): Promise<NormalizedItem[]> {
  const seen = new Set<string>();
  const items: NormalizedItem[] = [];
  const searchUnits = getSearchUnitsForProvince(provinceCode);

  for (const unit of searchUnits) {
    for (const keyword of KEYWORDS) {
      let raw: NaverNewsItem[] = [];
      try {
        raw = await searchOnce(unit, keyword);
      } catch (err) {
        console.error(`[naver-news] ${unit}+${keyword} 실패:`, err);
        continue;
      }

      for (const r of raw) {
        const url = r.originallink || r.link;
        if (!url || seen.has(url)) continue;
        seen.add(url);

        const title = stripNaverMarkup(r.title);
        const description = stripNaverMarkup(r.description);
        const cleaned = cleanDescription(description);

        // keepioo 도메인 키워드 2차 필터.
        const textBlob = [title, cleaned].filter(Boolean).join(" ");
        const newsKeywords = extractNewsKeywords([title, cleaned]);
        if (newsKeywords.length === 0) continue;

        // 노이즈 필터 — 정치 인물·정당 / 대괄호 모음·일정 / 기업 CSR /
        // 사건사고 / 정부 평가 5종. 매칭되면 welfare/loan 저장 안 함.
        // 28,314건 전수조사 기준 약 19.7% 차단 → 진짜 정책만 보존.
        if (isNewsNoise(title)) continue;

        const sourceId = hashSourceId(url);
        const benefit_tags = extractBenefitTags(textBlob);

        const pubDate = new Date(r.pubDate);
        const published_at = Number.isNaN(pubDate.getTime())
          ? new Date().toISOString()
          : pubDate.toISOString();

        items.push({
          source_code: `naver-news-${provinceCode}`,
          source_id: sourceId,
          source_url: url,
          ministry: provinceName, // "전라남도" — news_posts.ministry
          title,
          summary: cleaned.length > 0 ? cleaned.slice(0, 500) : null,
          keywords: newsKeywords,
          benefit_tags,
          published_at,
        });
      }
    }
  }

  return items;
}

// URL 안전 + 결정론적 slug — title + 광역코드 + sourceId 결합.
// 광역코드 포함 이유: 여러 광역 cron 이 같은 뉴스(같은 originallink) 를 수집하면
// title+sourceId 만으로 slug 가 같아져 news_posts.slug UNIQUE 제약 충돌. 광역을
// slug 에 넣어 '각 광역에서 수집된 기록' 으로 분리.
function deterministicSlug(
  title: string,
  provinceCode: string,
  sourceId: string,
): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
  return `${base}-${provinceCode}-${sourceId}`.slice(0, 130);
}

// 광역별 cron 진입점. news_posts 로 UPSERT.
export async function collectNaverNewsByProvince(provinceCode: ProvinceCode): Promise<{
  province: string;
  total: number;
  news_upserted: number;
  searchUnits: number;
  errors: string[];
}> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      province: provinceCode,
      total: 0,
      news_upserted: 0,
      searchUnits: 0,
      errors: [
        "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 미설정 — 네이버 개발자센터 가입 필요",
      ],
    };
  }

  const province = getProvinceByCode(provinceCode);
  if (!province) {
    return {
      province: provinceCode,
      total: 0,
      news_upserted: 0,
      searchUnits: 0,
      errors: [`unknown province code: ${provinceCode}`],
    };
  }

  const errors: string[] = [];
  const searchUnits = getSearchUnitsForProvince(provinceCode).length;

  let items: NormalizedItem[] = [];
  try {
    items = await collectProvinceItems(provinceCode, province.name);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      province: province.name,
      total: 0,
      news_upserted: 0,
      searchUnits,
      errors,
    };
  }

  const total = items.length;
  if (total === 0) {
    return {
      province: province.name,
      total: 0,
      news_upserted: 0,
      searchUnits,
      errors,
    };
  }

  const supabase = createAdminClient();

  // news_posts 용 payload 변환. korea.kr 수집분과 같은 스키마 사용.
  // license='naver-news-api' — 공공누리(KOGL-Type1) 아님, 원 저작권 원 언론사.
  const now = new Date().toISOString();
  const payloads = items.map((it) => ({
    source_code: it.source_code,
    source_id: it.source_id,
    source_url: it.source_url,
    license: "naver-news-api",
    category: "news" as const,
    ministry: it.ministry,
    benefit_tags: it.benefit_tags,
    title: it.title,
    summary: it.summary,
    body: null,
    thumbnail_url: null,
    slug: deterministicSlug(it.title, provinceCode, it.source_id),
    published_at: it.published_at,
    created_at: now,
    updated_at: now,
    view_count: 0,
    keywords: it.keywords,
    topic_categories: [] as string[],
  }));

  let news_upserted = 0;
  const { data, error } = await supabase
    .from("news_posts")
    .upsert(payloads, {
      onConflict: "source_code,source_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) {
    errors.push(`news_posts upsert: ${error.message}`);
  } else {
    news_upserted = data?.length ?? 0;
  }

  return {
    province: province.name,
    total,
    news_upserted,
    searchUnits,
    errors,
  };
}
