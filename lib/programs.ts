import { createClient } from "@/lib/supabase/server";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
import type {
  IncomeTargetLevel,
  HouseholdTargetTag,
} from "@/lib/personalization/targeting-extract";
export { calcDday } from "@/lib/utils";
import { calcDday } from "@/lib/utils";

// 홈 개인화용 경량 프로필 타입 (user_profiles 에서 select 한 세 필드만)
export type ProfileLite = {
  age_group: string | null;
  region: string | null;
  occupation: string | null;
};

export type DisplayProgram = {
  id: string;
  title: string;
  category: string;
  target: string;
  description: string;
  amount: string;
  source: string;
  dday: number | null;
  icon: "house" | "briefcase" | "heart" | "medical" | "coin" | "store" | "shield";
  type: "welfare" | "loan";
  sourceCode: string | null;
  sourceUrl: string | null;
  // Phase 1.5 본문 분석 결과 — 카드 자격 배지에 사용
  incomeTargetLevel: IncomeTargetLevel | null;
  householdTargetTags: HouseholdTargetTag[];
};

const categoryIconMap: Record<string, DisplayProgram["icon"]> = {
  "주거": "house",
  "취업": "briefcase",
  "양육": "heart",
  "의료": "medical",
  "소득": "coin",
  "대출": "coin",
  "지원금": "store",
  "보증": "shield",
};

// household_target_tags 는 DB 에서 string[] 로 오므로 좁은 타입으로 변환.
// 예상 외 값은 무시 (배지 컴포넌트도 동일 가드).
const VALID_HOUSEHOLD_TAGS = new Set<HouseholdTargetTag>([
  "single_parent",
  "multi_child",
  "married",
  "disabled_family",
  "elderly_family",
  "single",
]);

function narrowHouseholdTags(tags: string[] | null): HouseholdTargetTag[] {
  if (!tags) return [];
  return tags.filter((t): t is HouseholdTargetTag =>
    VALID_HOUSEHOLD_TAGS.has(t as HouseholdTargetTag),
  );
}

export function welfareToDisplay(w: WelfareProgram): DisplayProgram {
  return {
    id: w.id,
    title: w.title,
    category: w.category,
    target: w.target || "전체",
    description: w.description || "",
    amount: w.benefits || "",
    source: w.source,
    dday: calcDday(w.apply_end),
    icon: categoryIconMap[w.category] || "house",
    type: "welfare",
    sourceCode: w.source_code ?? null,
    sourceUrl: w.source_url ?? null,
    incomeTargetLevel: w.income_target_level ?? null,
    householdTargetTags: narrowHouseholdTags(w.household_target_tags),
  };
}

export function loanToDisplay(l: LoanProgram): DisplayProgram {
  const parts = [l.loan_amount, l.interest_rate].filter(Boolean);
  return {
    id: l.id,
    title: l.title,
    category: l.category,
    target: l.target || "전체",
    description: l.description || "",
    amount: parts.join(" · "),
    source: l.source,
    dday: calcDday(l.apply_end),
    icon: categoryIconMap[l.category] || "coin",
    type: "loan",
    sourceCode: l.source_code ?? null,
    sourceUrl: l.source_url ?? null,
    incomeTargetLevel: l.income_target_level ?? null,
    householdTargetTags: narrowHouseholdTags(l.household_target_tags),
  };
}

/**
 * 마감 임박 N건 (복지 + 대출 통합, apply_end 오름차순)
 * 홈 상단 AlertStrip 에서 사용. 정보 밀도를 높이려 1건 → N건 노출.
 * - daysAhead: 향후 N일 이내 마감만 고려 (너무 먼 미래 제외)
 * - limit: 반환 개수
 */
export async function getUrgentPrograms(limit = 3, daysAhead = 14): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + daysAhead);
  const futureStr = futureDate.toISOString().split("T")[0];

  const [{ data: welfareData }, { data: loanData }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .gte("apply_end", todayStr)
      .lte("apply_end", futureStr)
      .order("apply_end", { ascending: true })
      .limit(limit),
    supabase
      .from("loan_programs")
      .select("*")
      .gte("apply_end", todayStr)
      .lte("apply_end", futureStr)
      .order("apply_end", { ascending: true })
      .limit(limit),
  ]);

  const welfare = (welfareData ?? []).map(welfareToDisplay);
  const loan = (loanData ?? []).map(loanToDisplay);

  // 복지·대출 합쳐서 dday 오름차순으로 top-K
  return [...welfare, ...loan]
    .filter((p) => p.dday !== null)
    .sort((a, b) => (a.dday ?? Infinity) - (b.dday ?? Infinity))
    .slice(0, limit);
}

// ============================================================
// /popular 페이지용 — 스마트 랭킹 + 필터
// ============================================================
// 단순 view_count 정렬로는 마감 지난 공고도 포함되고, 마감 임박 공고가
// 누적 조회수 부족으로 묻혀 사용자에게 도움 안 되는 문제 있었음.
//
// 해결:
//   1) 마감 지난 공고 자동 제외 (apply_end < today)
//   2) score = view_count × deadlineBoost 로 정렬
//      - D-7 이내: ×1.5 (마감 임박 + 인기 = 진짜 핫)
//      - D-30 이내: ×1.2 (곧 마감)
//      - 그 외 (상시 포함): ×1.0
//   3) category·region 필터 + sort=popular|deadline 옵션
// ============================================================

import { getRegionMatchPatterns } from "@/lib/regions";

export type PopularSort = "popular" | "deadline";

export type PopularFilter = {
  programType: "welfare" | "loan";
  category?: string;       // "전체" 또는 welfare/loan 카테고리 정확 일치
  region?: string;          // "전국" 또는 짧은 이름 (전남·서울 등)
  sort?: PopularSort;       // 기본 popular
};

type RowWithViewCount = WelfareProgram | LoanProgram;

// 마감일 가중치 — 임박할수록 인기 부스트
function deadlineBoost(dday: number | null): number {
  if (dday === null) return 1.0;       // 상시
  if (dday <= 7) return 1.5;
  if (dday <= 30) return 1.2;
  return 1.0;
}

export async function getPopularPrograms(
  filter: PopularFilter,
  limit = 20,
): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const table = filter.programType === "welfare" ? "welfare_programs" : "loan_programs";

  let query = supabase
    .from(table)
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`);

  // 카테고리 필터 (정확 일치)
  if (filter.category && filter.category !== "전체") {
    query = query.eq("category", filter.category);
  }

  // 지역 필터 — welfare 는 region 컬럼, loan 은 title prefix 매칭
  if (filter.region && filter.region !== "전국") {
    const patterns = getRegionMatchPatterns(filter.region);
    if (filter.programType === "welfare") {
      const orConds = patterns.map((p) => `region.ilike.%${p}%`).join(",");
      query = query.or(orConds);
    } else {
      // loan: 제목에 [전남% 또는 (전남% 패턴
      const orConds = patterns.flatMap((p) => [
        `title.ilike.%[${p}%`,
        `title.ilike.%(${p}%`,
      ]).join(",");
      query = query.or(orConds);
    }
  }

  // 정렬: deadline 은 SQL 단에서 마감순. popular 는 score 재정렬을 위해
  // view_count 상위 limit*3 가져온 뒤 JS 사이드에서 boost 적용 후 재정렬.
  if (filter.sort === "deadline") {
    query = query.order("apply_end", { ascending: true, nullsFirst: false }).limit(limit);
    const { data } = await query;
    return (data || []).map(
      filter.programType === "welfare"
        ? welfareToDisplay
        : loanToDisplay,
    );
  }

  // sort === "popular" (기본)
  query = query.order("view_count", { ascending: false }).limit(limit * 3);
  const { data } = await query;
  const rows = (data || []) as RowWithViewCount[];

  // score 재정렬: view_count × 마감 가중치
  const scored = rows.map((row) => {
    const dday = calcDday(row.apply_end);
    const score = (row.view_count ?? 0) * deadlineBoost(dday);
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ row }) =>
    filter.programType === "welfare"
      ? welfareToDisplay(row as WelfareProgram)
      : loanToDisplay(row as LoanProgram),
  );
}

// 마감 7일 이내 + 조회수 상위 — /popular 상단 강조 섹션용
export async function getDeadlineSoonPopular(
  programType: "welfare" | "loan",
  limit = 5,
): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  const table = programType === "welfare" ? "welfare_programs" : "loan_programs";

  const { data } = await supabase
    .from(table)
    .select("*")
    .gte("apply_end", todayStr)
    .lte("apply_end", sevenDaysLater)
    .order("view_count", { ascending: false })
    .limit(limit);

  return (data || []).map(
    programType === "welfare" ? welfareToDisplay : loanToDisplay,
  );
}

// === 하위 호환 ===
// 기존 호출부 (홈 등) 가 있을 수 있어 deprecated wrapper 유지.
// 새 코드는 getPopularPrograms 사용 권장.
export async function getPopularWelfare(limit = 20): Promise<DisplayProgram[]> {
  return getPopularPrograms({ programType: "welfare" }, limit);
}

export async function getPopularLoans(limit = 20): Promise<DisplayProgram[]> {
  return getPopularPrograms({ programType: "loan" }, limit);
}

// 홈·/recommend 의 맞춤 추천 로직은 lib/recommend.ts 의 getRecommendations 로
// 일원화됨. 이전 getPersonalizedWelfare · getPersonalizedLoans 는 지역 필터·직업
// 필수 매칭이 누락돼 있어 홈에서 전남 사용자에게 광주·서울·대전·부산 공고가 뜨던
// 회귀 원인. 제거 후 호출부(app/page.tsx) 는 getRecommendations({ programType, limit })
// 로 교체.

export async function getRelatedPrograms(
  type: "welfare" | "loan",
  category: string,
  excludeId: string,
  region?: string | null,
  limit = 4,
): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const table = type === "welfare" ? "welfare_programs" : "loan_programs";
  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from(table)
    .select("*")
    .eq("category", category)
    .neq("id", excludeId)
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (region && region !== "전국" && type === "welfare") {
    query = query.eq("region", region);
  }

  const { data } = await query;
  if (!data || data.length === 0) {
    // region 필터로 결과가 없으면 region 없이 재조회
    if (region && region !== "전국" && type === "welfare") {
      const { data: fallback } = await supabase
        .from(table)
        .select("*")
        .eq("category", category)
        .neq("id", excludeId)
        .or(`apply_end.gte.${today},apply_end.is.null`)
        .order("apply_end", { ascending: true, nullsFirst: false })
        .limit(limit);
      return (fallback || []).map(type === "welfare" ? welfareToDisplay : loanToDisplay);
    }
    return [];
  }

  return data.map(type === "welfare" ? welfareToDisplay : loanToDisplay);
}
