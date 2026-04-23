import { createClient } from "@/lib/supabase/server";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
export { calcDday } from "@/lib/utils";
import { calcDday } from "@/lib/utils";

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
