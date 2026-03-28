import { createClient } from "@/lib/supabase/server";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";

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

function calcDday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
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
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [{ data: welfareData }, { data: loanData }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .gte("apply_end", today)
      .order("apply_end", { ascending: true })
      .limit(1),
    supabase
      .from("loan_programs")
      .select("*")
      .gte("apply_end", today)
      .order("apply_end", { ascending: true })
      .limit(1),
  ]);

  const welfare = welfareData?.[0] ? welfareToDisplay(welfareData[0]) : null;
  const loan = loanData?.[0] ? loanToDisplay(loanData[0]) : null;

  if (!welfare && !loan) return null;
  if (!welfare) return loan;
  if (!loan) return welfare;

  // Return whichever has the sooner deadline
  return (welfare.dday !== null && loan.dday !== null && welfare.dday <= loan.dday) ? welfare : loan;
}
