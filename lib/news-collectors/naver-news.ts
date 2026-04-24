// ============================================================
// 네이버 뉴스 검색 API — 전국 시군구 정책 뉴스 수집
// ============================================================
// keepioo 의 큰 빈틈: 지방 자치단체의 보편 지원금·민생회복지원금·시민
// 대상 정책은 지역 언론 보도 → 시청 보도자료 → SNS 형태로 퍼지지만
// data.go.kr 의 LocalGovernmentWelfareInformations 에는 등록이 늦거나
// 누락되는 경우가 많음. 예: 순천시 민생회복지원금 15만원 (2026-04-02
// 발표·4-20 신청) 같은 일회성 보편 지급은 보건복지부 DB 미등록.
//
// 해결 전략: 네이버 뉴스 검색 API 로 "광역명 [시군구명] + keepioo 정책
// 키워드" 매트릭스 검색 → 지방지·통신사 보도 자동 수집.
// 17 광역 + 228 시군구 = 245 단위 × 18 키워드 = 4,410회/일,
// 일일 무료 한도 25,000회 대비 17.6% 사용. 키워드는 시민 복지·일자리·
// 주거·의료·양육·금융 전반 (혜택성·정책액션·대상층 분류).
//
// 처리 단위: 광역별로 cron 분리 (광역 1개 + 그 광역의 시군구 모두 처리).
// 가장 큰 경기도 = 32 단위 × 18 × 0.3s ≈ 173s — Vercel maxDuration 300s
// 안에 들어옴. 단일 cron 으로 245 × 18 = 4,410회 = ~22분 은 한계 초과.
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
import {
  type ProvinceCode,
  getProvinceByCode,
  getSearchUnitsForProvince,
} from "@/lib/regions";
import { createHash } from "node:crypto";

const CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
const API = "https://openapi.naver.com/v1/search/news.json";

// keepioo 사용자 니즈 전반 — 시민 복지·일자리·주거·의료·양육·금융 모두 커버.
// 1차 검색 노이즈는 OK — 아래에서 extractNewsKeywords (26개 keepioo
// 도메인 키워드) 2차 필터로 걸러짐. 그래서 검색 키워드는 광범위하게 잡아도
// 노이즈 안 쌓임.
const KEYWORDS = [
  // 혜택성 — 가장 강한 신호
  "지원금",
  "보조금",
  "장려금",
  "수당",
  "바우처",
  "장학금",
  // 정책 액션 — 시민 신청·참여
  "모집",
  "공모",
  // 일자리·창업
  "일자리",
  "창업지원",
  "취업지원",
  // 주거 — 청년·신혼·서민
  "임대주택",
  "청년주택",
  "전세대출",
  // 의료·건강
  "의료비",
  // 양육·돌봄
  "출산지원",
  "돌봄",
  // 시민 직접지급
  "민생회복",
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

// 네이버 뉴스 검색 1회 — searchUnit + keyword 조합.
// searchUnit 예: "전라남도" 또는 "전라남도 순천시".
// display=20 으로 충분 (sort=date 라 최신 20건이 곧 핵심 뉴스).
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

// 1개 광역(=cron 1회 처리 단위) 의 모든 검색 단위 × 모든 키워드 처리.
// 검색 단위 = 광역명 + 그 광역의 모든 시군구 (lib/regions.ts).
// 결과를 dedup (originallink 기준) 후 표준 포맷 변환.
async function collectProvinceItems(
  provinceCode: ProvinceCode,
  provinceName: string,
): Promise<CollectedNaverItem[]> {
  const seen = new Set<string>();
  const items: CollectedNaverItem[] = [];
  const searchUnits = getSearchUnitsForProvince(provinceCode);

  // 검색 단위 × 키워드 모두 순차 — 네이버 API 동일 IP 동시요청에 민감 (429 위험).
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
          source_code: `naver-news-${provinceCode}`,
          source_id: sourceId,
          source_url: url,
          category: "news",
          ministry: provinceName, // 광역명을 ministry 자리에 — UI 출처 표시용
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
  }

  return items;
}

// 광역별 cron 의 핵심 진입점. /api/collect-news/[province]/route.ts 가 호출.
// 결과: 그 광역의 광역명 + 모든 시군구를 검색해서 news_posts 에 upsert.
export async function collectNaverNewsByProvince(provinceCode: ProvinceCode): Promise<{
  province: string;
  total: number;
  upserted: number;
  searchUnits: number;
  errors: string[];
}> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      province: provinceCode,
      total: 0,
      upserted: 0,
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
      upserted: 0,
      searchUnits: 0,
      errors: [`unknown province code: ${provinceCode}`],
    };
  }

  const errors: string[] = [];
  const searchUnits = getSearchUnitsForProvince(provinceCode).length;

  let items: CollectedNaverItem[] = [];
  try {
    items = await collectProvinceItems(provinceCode, province.name);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { province: province.name, total: 0, upserted: 0, searchUnits, errors };
  }

  const total = items.length;
  if (total === 0) {
    return { province: province.name, total: 0, upserted: 0, searchUnits, errors };
  }

  const supabase = createAdminClient();
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

  // slug 충돌 = 같은 뉴스가 다른 시군구·광역 검색에 잡힌 경우 (예: "전국 정책",
  // 또는 "전라남도" + "전라남도 순천시" 양쪽 검색에 같은 기사). 첫 광역 cron 이
  // 가져간 ministry 유지 — ignoreDuplicates.
  const { data, error } = await supabase
    .from("news_posts")
    .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
    .select("id");

  if (error) {
    errors.push(`upsert: ${error.message}`);
    return { province: province.name, total, upserted: 0, searchUnits, errors };
  }

  return {
    province: province.name,
    total,
    upserted: data?.length ?? 0,
    searchUnits,
    errors,
  };
}
