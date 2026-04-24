// ============================================================
// 네이버 뉴스 검색 API — 전국 시군구 정책 정보 수집
// ============================================================
// 2026-04-24 사장님 결정: 네이버 뉴스 검색 결과는 "정책 발표 정보" 이므로
// /news (뉴스 목록) 가 아니라 welfare_programs / loan_programs (사용자가
// 신청 정보를 찾는 곳) 에 직접 저장한다.
//
// 이유: 사용자가 keepioo.com 에서 "순천 15만원" 검색 시 /welfare 에서
// 잡혀야 함. 신문 기사는 발표 알림이긴 하지만, keepioo 사용자 입장에서는
// "순천시민에게 15만원 지원금이 있다" 가 핵심 정보.
//
// 분기 규칙:
//   - title 또는 summary 에 "대출·보증·융자·이차보전·융자금" → loan_programs
//   - 그 외 (지원금·보조금·바우처·수당 등) → welfare_programs
//
// 한계 (사장님 인지):
//   - 신문 기사라 신청기간(apply_end)·대상(target)·혜택(benefits) 등 NULL
//   - 카드 클릭 → source_url (신문 원문) 로 외부 이동 → 시청 링크 따라가서 신청
//
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (네이버 개발자센터 발급)
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

// loan 분기 — 강·약 신호 가중치 + title 우선 + 네거티브 키워드.
//
// 정확도 60-70% → 향상 전략:
//   1) title 만 검사 (summary 노이즈 제거)
//   2) STRONG (대출·융자·이차보전) = +2점, WEAK (보증재단 단순언급) = +1점
//   3) NEGATIVE (지원금·보조금·바우처 등 명시적 welfare 단어) = -3점
//   4) 합산 ≥ 1 이면 loan, 그 외는 welfare
//
// 예시:
//   "[전남] 소상공인 융자금 신청" → 융자금(+2) → loan ✓
//   "전남신용보증재단 지원금 안내" → 보증재단(+1) - 지원금(-3) = -2 → welfare ✓
//   "민생회복지원금 신청" → 지원금(-3) → welfare ✓
const LOAN_STRONG = /대출|융자|이차보전|융자금|보증부\s*월세|특례보증/;
const LOAN_WEAK = /보증재단/;
const LOAN_NEGATIVE = /지원금|보조금|바우처|장려금|수당|민생회복|모집|공모/;

function classifyAsLoan(title: string): boolean {
  let score = 0;
  if (LOAN_STRONG.test(title)) score += 2;
  if (LOAN_WEAK.test(title)) score += 1;
  if (LOAN_NEGATIVE.test(title)) score -= 3;
  return score >= 1;
}

// welfare 카테고리 자동 매핑 — local-welfare collector 와 동일 규칙.
function mapCategory(text: string): string {
  if (!text) return "소득";
  if (/주거|임대|월세|주택/.test(text)) return "주거";
  if (/취업|고용|일자리/.test(text)) return "취업";
  if (/양육|보육|출산|임신|돌봄/.test(text)) return "양육";
  if (/의료|건강|장애|치료/.test(text)) return "의료";
  if (/교육|학자금|장학|학생/.test(text)) return "교육";
  if (/문화|여가|바우처|관광/.test(text)) return "문화";
  if (/소상공인|자영업|창업|중소기업/.test(text)) return "소상공인";
  if (/농업|어업|임업|귀농|귀어|농민|어민/.test(text)) return "농업";
  if (/재난|긴급|위기|이재민|민생회복/.test(text)) return "재난";
  return "소득";
}

// loan 카테고리 — loan_programs.category 가 가질 수 있는 값.
function mapLoanCategory(text: string): string {
  if (/창업/.test(text)) return "창업지원";
  if (/소상공인/.test(text)) return "소상공인지원";
  if (/보증/.test(text)) return "보증";
  if (/지원금|장려금/.test(text)) return "지원금";
  return "대출";
}

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

// 표준화된 1건 — welfare 또는 loan 둘 중 한 곳에 INSERT.
type NormalizedItem = {
  table: "welfare" | "loan";
  source_code: string;
  source_id: string;
  source_url: string;
  source: string; // ministry (광역명)
  title: string;
  category: string;
  description: string | null;
  region: string;
  region_tags: string[];
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

        const sourceId = hashSourceId(url);
        // 분기는 title 만 검사 (summary 노이즈 제거 → 정확도 ↑).
        // 카테고리 매핑은 title+summary 합쳐서 (더 풍부한 신호).
        const isLoan = classifyAsLoan(title);
        const table: "welfare" | "loan" = isLoan ? "loan" : "welfare";
        const category = isLoan ? mapLoanCategory(textBlob) : mapCategory(textBlob);

        // region_tags 는 광역 1개만. taxonomy.extractRegionTags 는 정식 광역명
        // ("전라남도") 을 못 받는 짧은 이름 enum 이라 미사용. 정확한 매칭은
        // region 컬럼으로 충분.
        const region_tags = [provinceName];
        const benefit_tags = extractBenefitTags(textBlob);

        const pubDate = new Date(r.pubDate);
        const published_at = Number.isNaN(pubDate.getTime())
          ? new Date().toISOString()
          : pubDate.toISOString();

        items.push({
          table,
          source_code: `naver-news-${provinceCode}`,
          source_id: sourceId,
          source_url: url,
          source: provinceName, // "전라남도"
          title,
          category,
          description: cleaned.length > 0 ? cleaned.slice(0, 500) : null,
          region: provinceName, // /welfare 의 region 필터와 매칭
          region_tags,
          benefit_tags,
          published_at,
        });
      }
    }
  }

  return items;
}

// 광역별 cron 진입점. welfare/loan 분기 후 각 테이블에 UPSERT.
export async function collectNaverNewsByProvince(provinceCode: ProvinceCode): Promise<{
  province: string;
  total: number;
  welfare_upserted: number;
  loan_upserted: number;
  searchUnits: number;
  errors: string[];
}> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      province: provinceCode,
      total: 0,
      welfare_upserted: 0,
      loan_upserted: 0,
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
      welfare_upserted: 0,
      loan_upserted: 0,
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
      welfare_upserted: 0,
      loan_upserted: 0,
      searchUnits,
      errors,
    };
  }

  const total = items.length;
  if (total === 0) {
    return {
      province: province.name,
      total: 0,
      welfare_upserted: 0,
      loan_upserted: 0,
      searchUnits,
      errors,
    };
  }

  const supabase = createAdminClient();
  const welfareItems = items.filter((it) => it.table === "welfare");
  const loanItems = items.filter((it) => it.table === "loan");

  // welfare/loan 공통 payload 변환. apply_* 필드는 신문 기사라 NULL.
  const toPayload = (it: NormalizedItem) => ({
    source_code: it.source_code,
    source_id: it.source_id,
    title: it.title,
    category: it.category,
    description: it.description,
    source: it.source,
    source_url: it.source_url,
    region: it.region,
    region_tags: it.region_tags,
    benefit_tags: it.benefit_tags,
    published_at: it.published_at,
    updated_at: new Date().toISOString(),
  });

  // welfare upsert
  let welfare_upserted = 0;
  if (welfareItems.length > 0) {
    const { data, error } = await supabase
      .from("welfare_programs")
      .upsert(welfareItems.map(toPayload), {
        onConflict: "source_code,source_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      errors.push(`welfare upsert: ${error.message}`);
    } else {
      welfare_upserted = data?.length ?? 0;
    }
  }

  // loan upsert
  let loan_upserted = 0;
  if (loanItems.length > 0) {
    const { data, error } = await supabase
      .from("loan_programs")
      .upsert(loanItems.map(toPayload), {
        onConflict: "source_code,source_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      errors.push(`loan upsert: ${error.message}`);
    } else {
      loan_upserted = data?.length ?? 0;
    }
  }

  return {
    province: province.name,
    total,
    welfare_upserted,
    loan_upserted,
    searchUnits,
    errors,
  };
}
