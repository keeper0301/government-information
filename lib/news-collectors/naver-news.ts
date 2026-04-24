// ============================================================
// 네이버 뉴스 검색 API — 지방 정책 뉴스 수집
// ============================================================
// keepioo 의 큰 빈틈: 지방 자치단체의 보편 지원금·민생회복지원금·시민
// 대상 정책은 지역 언론 보도 → 시청 보도자료 → SNS 형태로 퍼지지만
// data.go.kr 의 LocalGovernmentWelfareInformations 에는 등록이 늦거나
// 누락되는 경우가 많음. 예: 순천시 민생회복지원금 15만원 (2026-04-02
// 발표·4-20 신청) 같은 일회성 보편 지급은 보건복지부 DB 미등록.
//
// 해결 전략: 네이버 뉴스 검색 API 로 "광역명 + 핵심 정책 키워드" 매트릭스
// 검색 → 지방지·통신사 보도 자동 수집. 17개 광역 × 5개 키워드 = 85회/일,
// 일일 무료 한도 25,000회 대비 0.34% 만 사용.
//
// 저작권 안전 모드:
//   - 본문 미저장 (body=null) — 언론사 저작권 침해 방지
//   - 요약 (description) 만 저장 — 검색 결과 발췌이므로 fair use 범위
//   - source_url = originallink (언론사 원본 링크) — 외부 트래픽 유도
//   - title 의 <b>강조 태그·HTML 엔티티 정제
//
// 환경변수:
//   - NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (네이버 개발자센터 발급)
//   - https://developers.naver.com → 애플리케이션 등록 → 사용 API: 검색
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { extractBenefitTags } from "@/lib/tags/taxonomy";
import { extractNewsKeywords } from "@/lib/news-keywords";
import { cleanDescription } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/collectors";
import { createHash } from "node:crypto";

const CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
const API = "https://openapi.naver.com/v1/search/news.json";

// 17개 광역 — 네이버 검색에서 시군구까지 자동으로 포함되어 매칭됨.
// 예: "전라남도 지원금" → 순천시·여수시·광양시 지원금 뉴스 모두 포함.
const REGIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

// keepioo 핵심 키워드 — 공고·신청 액션이 있는 정책만 잡도록 좁힘.
// "지원금"·"보조금"·"장려금" → 시민·소상공인 직접 수혜성
// "민생회복" → 일회성 보편 지급 (지역화폐 형태 다수)
// "모집" → 교육·체험·창업 프로그램 신청 트리거
const KEYWORDS = [
  "지원금",
  "보조금",
  "장려금",
  "민생회복",
  "모집",
];

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

export type CollectedNaverItem = {
  source_code: string;
  source_id: string;
  source_url: string;
  category: "news";
  ministry: string;
  title: string;
  summary: string | null;
  body: null; // 저작권 안전 — 본문 미저장
  thumbnail_url: null; // 네이버 검색 API 응답에 썸네일 없음
  slug: string;
  benefit_tags: string[];
  keywords: string[];
  published_at: string;
};

// title·description 의 HTML 강조 태그·엔티티 정제.
// 네이버 응답: "전남 <b>순천시</b>, 민생회복지원금 15만원 지급" 형식.
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

// originallink (언론사 원본 URL) 의 sha1 해시 → unique source_id.
// 언론사 URL 형식이 매체별로 천차만별이라 해시가 가장 안전.
function hashSourceId(originallink: string): string {
  return createHash("sha1").update(originallink).digest("hex").slice(0, 16);
}

// URL 안전 + SEO 친화 slug — 제목 + source_id 8자.
// korea-kr 의 deterministicSlug 와 동일 패턴.
function deterministicSlug(title: string, sourceId: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${base}-${sourceId.slice(0, 8)}`.slice(0, 120);
}

// 네이버 뉴스 검색 1회 — region + keyword 조합.
// display=20 으로 충분 (sort=date 라 최신 20건이 곧 핵심 뉴스).
async function searchOnce(region: string, keyword: string): Promise<NaverNewsItem[]> {
  const query = `${region} ${keyword}`;
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
    throw new Error(`naver-news ${region}+${keyword} HTTP ${res.status}`);
  }
  const data = (await res.json()) as NaverApiResponse;
  return data.items ?? [];
}

// 1개 광역 × 5개 키워드 → 결과 합치고 중복 제거 후 표준 포맷 변환.
async function collectRegion(region: string): Promise<CollectedNaverItem[]> {
  const seen = new Set<string>();
  const items: CollectedNaverItem[] = [];

  // 키워드는 순차 — 네이버 API 가 동일 IP 동시요청에 민감 (429 위험).
  for (const keyword of KEYWORDS) {
    let raw: NaverNewsItem[] = [];
    try {
      raw = await searchOnce(region, keyword);
    } catch (err) {
      console.error(`[naver-news] ${region}+${keyword} 실패:`, err);
      continue;
    }

    for (const r of raw) {
      // dedup: originallink 가 빈 매체는 link 로 대체
      const url = r.originallink || r.link;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const title = stripNaverMarkup(r.title);
      const description = stripNaverMarkup(r.description);
      const cleaned = cleanDescription(description);

      // keepioo 도메인 키워드 필터 — 정치인 발언·일반 행사 노이즈 차단.
      // 검색 키워드(지원금 등)는 잡혀도 "○○ 의원, 지원금 폐지 비판" 같은
      // 정치 기사는 본문 키워드(청년·소상공인 등) 안 맞으면 스킵.
      const textBlob = [title, cleaned].filter(Boolean).join(" ");
      const keywords = extractNewsKeywords([title, cleaned]);
      if (keywords.length === 0) continue;

      const benefit_tags = extractBenefitTags(textBlob);
      const sourceId = hashSourceId(url);
      const slug = deterministicSlug(title, sourceId);

      // pubDate 파싱: "Tue, 21 Apr 2026 15:30:00 +0900"
      const pubDate = new Date(r.pubDate);
      const published_at = Number.isNaN(pubDate.getTime())
        ? new Date().toISOString()
        : pubDate.toISOString();

      items.push({
        source_code: `naver-news-${regionShortCode(region)}`,
        source_id: sourceId,
        source_url: url,
        category: "news",
        ministry: region, // 광역명을 ministry 자리에 — UI 에서 출처 표시용
        title,
        summary: cleaned.length > 0 ? cleaned.slice(0, 200) : null,
        body: null,
        thumbnail_url: null,
        slug,
        benefit_tags,
        keywords,
        published_at,
      });
    }
  }

  return items;
}

// 광역명 → 짧은 source_code 식별자 ("전라남도" → "jeonnam")
function regionShortCode(region: string): string {
  const map: Record<string, string> = {
    서울특별시: "seoul",
    부산광역시: "busan",
    대구광역시: "daegu",
    인천광역시: "incheon",
    광주광역시: "gwangju",
    대전광역시: "daejeon",
    울산광역시: "ulsan",
    세종특별자치시: "sejong",
    경기도: "gyeonggi",
    강원특별자치도: "gangwon",
    충청북도: "chungbuk",
    충청남도: "chungnam",
    전북특별자치도: "jeonbuk",
    전라남도: "jeonnam",
    경상북도: "gyeongbuk",
    경상남도: "gyeongnam",
    제주특별자치도: "jeju",
  };
  return map[region] ?? "unknown";
}

// 17개 광역 × 5개 키워드 = 85회 호출. 호출당 ~0.3초 추정 → 25-30초 예상.
// Vercel Pro 300s maxDuration 안에 안전하게 들어감.
export async function collectNaverNews(): Promise<{
  total: number;
  upserted: number;
  errors: number;
  breakdown: Record<string, number>;
  errorDetails: Record<string, string>;
}> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      total: 0,
      upserted: 0,
      errors: 1,
      breakdown: {},
      errorDetails: {
        config:
          "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 미설정 — 네이버 개발자센터 가입 필요",
      },
    };
  }

  const supabase = createAdminClient();
  let total = 0;
  let upserted = 0;
  let errors = 0;
  const breakdown: Record<string, number> = {};
  const errorDetails: Record<string, string> = {};

  // 광역도 순차 — 광역×키워드 병렬화하면 17×5=85건이 동시에 네이버로 가서
  // burst rate-limit (분당 한도) 에 걸릴 위험. 한 광역 내부 키워드 5개도
  // 순차이므로 전체는 순수 순차 ~25-30초 예상. maxDuration 300s 안에 여유.
  for (const region of REGIONS) {
    let items: CollectedNaverItem[] = [];
    try {
      items = await collectRegion(region);
    } catch (err) {
      errors++;
      errorDetails[region] = err instanceof Error ? err.message : String(err);
      continue;
    }

    breakdown[region] = items.length;
    total += items.length;

    if (items.length === 0) continue;

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

    // slug 충돌 = 같은 뉴스가 다른 광역 검색에 잡힌 경우 (예: "전국" 정책).
    // 먼저 들어온 광역이 ministry 유지 — ignoreDuplicates.
    const { data, error } = await supabase
      .from("news_posts")
      .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");

    if (error) {
      errors++;
      errorDetails[region] = `upsert: ${error.message}`;
      continue;
    }

    upserted += data?.length ?? 0;
  }

  return { total, upserted, errors, breakdown, errorDetails };
}

// (개발자 가드) 단일 광역만 빠르게 검증할 때.
export async function collectNaverNewsForRegion(region: string) {
  if (!REGIONS.includes(region)) {
    throw new Error(`unknown region: ${region}`);
  }
  return collectRegion(region);
}
