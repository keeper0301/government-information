// ============================================================
// 정책 unique_insight 백필 진행률 — autonomous hub Phase 3 카드
// ============================================================
// /admin/autonomous 가 매일 1번 호출 (graceful — DDL 083 미적용 시 0/0 반환).
// 사장님이 "오늘 keepioo 해설 몇 % 채워졌나" 한눈 인지.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type InsightProgress = {
  welfare: { filled: number; total: number };
  loan: { filled: number; total: number };
  /** 합산 % (0~100, 정수). total 0 이면 0. */
  pct: number;
};

async function countOne(
  table: "welfare_programs" | "loan_programs",
): Promise<{ filled: number; total: number }> {
  try {
    const admin = createAdminClient();
    const [filledRes, totalRes] = await Promise.all([
      admin.from(table).select("*", { count: "estimated", head: true })
        .not("unique_insight", "is", null),
      admin.from(table).select("*", { count: "estimated", head: true }),
    ]);
    if (filledRes.error || totalRes.error) return { filled: 0, total: 0 };
    return { filled: filledRes.count ?? 0, total: totalRes.count ?? 0 };
  } catch {
    return { filled: 0, total: 0 };
  }
}

export async function getInsightProgress(): Promise<InsightProgress> {
  const [welfare, loan] = await Promise.all([
    countOne("welfare_programs"),
    countOne("loan_programs"),
  ]);
  const filledSum = welfare.filled + loan.filled;
  const totalSum = welfare.total + loan.total;
  const pct = totalSum > 0 ? Math.round((filledSum / totalSum) * 100) : 0;
  return { welfare, loan, pct };
}
