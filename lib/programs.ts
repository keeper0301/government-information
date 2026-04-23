import { createClient } from "@/lib/supabase/server";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
import {
  AGE_KEYWORDS,
  OCCUPATION_KEYWORDS,
  type AgeOption,
  type OccupationOption,
} from "@/lib/profile-options";
export { calcDday } from "@/lib/utils";
import { calcDday } from "@/lib/utils";

// 홈 개인화용 경량 프로필 타입 (user_profiles 에서 select 한 세 필드만)
export type ProfileLite = {
  age_group: string | null;
  region: string | null;
  occupation: string | null;
};

// 프로필 → 검색 키워드 (title/target/description ILIKE 매칭용)
function buildProfileKeywords(profile: ProfileLite): string[] {
  const keywords: string[] = [];
  if (profile.age_group && profile.age_group in AGE_KEYWORDS) {
    keywords.push(...AGE_KEYWORDS[profile.age_group as AgeOption]);
  }
  if (profile.occupation && profile.occupation in OCCUPATION_KEYWORDS) {
    keywords.push(...OCCUPATION_KEYWORDS[profile.occupation as OccupationOption]);
  }
  // 중복 제거 + 소문자 정규화
  return [...new Set(keywords.map((k) => k.toLowerCase()))];
}

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
  };
}

export async function getTopWelfare(limit = 4): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("welfare_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data || []).map(welfareToDisplay);
}

export async function getTopLoans(limit = 3): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("loan_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data || []).map(loanToDisplay);
}

export async function getUrgentProgram(): Promise<DisplayProgram | null> {
  const urgents = await getUrgentPrograms(1);
  return urgents[0] ?? null;
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

// 인기 복지 프로그램 조회 (조회수 높은 순)
export async function getPopularWelfare(limit = 20): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("welfare_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("view_count", { ascending: false })
    .limit(limit);
  return (data || []).map(welfareToDisplay);
}

// 인기 대출 프로그램 조회 (조회수 높은 순)
export async function getPopularLoans(limit = 20): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("loan_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("view_count", { ascending: false })
    .limit(limit);
  return (data || []).map(loanToDisplay);
}

/**
 * 프로필 기반 맞춤 복지 — 활성 정책 중 프로필 키워드 (연령·직업) 와
 * 지역이 가장 잘 매칭되는 top-K. 매칭 부족 시 조회수 상위로 채움.
 */
export async function getPersonalizedWelfare(
  profile: ProfileLite,
  limit = 4,
): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const keywords = buildProfileKeywords(profile);

  // 후보 풀 — 활성 + 지역 (프로필 지역 + 전국·NULL)
  let query = supabase
    .from("welfare_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("view_count", { ascending: false })
    .limit(100);

  if (profile.region && profile.region !== "전국") {
    query = query.or(`region.eq.${profile.region},region.eq.전국,region.is.null`);
  }

  const { data } = await query;
  const rows = data ?? [];

  // 키워드 없음 (프로필 비어있음) 이면 지역 필터만으로 top-K
  if (keywords.length === 0) {
    return rows.slice(0, limit).map(welfareToDisplay);
  }

  // 키워드 점수 (title/target/description ILIKE)
  const scored = rows.map((r) => {
    const hay = `${r.title ?? ""} ${r.target ?? ""} ${r.description ?? ""}`.toLowerCase();
    let score = 0;
    for (const k of keywords) if (hay.includes(k)) score += 1;
    return { row: r, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (matched.length >= limit) {
    return matched.map((s) => welfareToDisplay(s.row));
  }

  // 매칭 부족 → 조회수 상위로 보충 (중복 제외)
  const matchedIds = new Set(matched.map((s) => s.row.id));
  const fill = rows.filter((r) => !matchedIds.has(r.id)).slice(0, limit - matched.length);
  return [...matched.map((s) => welfareToDisplay(s.row)), ...fill.map(welfareToDisplay)].slice(
    0,
    limit,
  );
}

/**
 * 프로필 기반 맞춤 대출·지원금 — 직업 매칭이 핵심 (대출은 지역 기반보다
 * 자영업·창업 등 업종 필터링이 더 유효)
 */
export async function getPersonalizedLoans(
  profile: ProfileLite,
  limit = 3,
): Promise<DisplayProgram[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const keywords = buildProfileKeywords(profile);

  const { data } = await supabase
    .from("loan_programs")
    .select("*")
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("view_count", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  if (keywords.length === 0) return rows.slice(0, limit).map(loanToDisplay);

  const scored = rows.map((r) => {
    const hay = `${r.title ?? ""} ${r.target ?? ""} ${r.description ?? ""}`.toLowerCase();
    let score = 0;
    for (const k of keywords) if (hay.includes(k)) score += 1;
    return { row: r, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (matched.length >= limit) return matched.map((s) => loanToDisplay(s.row));

  const matchedIds = new Set(matched.map((s) => s.row.id));
  const fill = rows.filter((r) => !matchedIds.has(r.id)).slice(0, limit - matched.length);
  return [...matched.map((s) => loanToDisplay(s.row)), ...fill.map(loanToDisplay)].slice(
    0,
    limit,
  );
}

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
