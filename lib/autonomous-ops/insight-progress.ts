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

// 2026-05-18 — 7일 백필 추세 + 100% 도달 ETA 추정.
// 5/18 cron 4→12 회/일 가속 (commit eb8849d) 효과 가시화.
// AdSense 5/24 재신청 검수 통과 시점에 백필 도달률 사장님 즉시 확인.
export type InsightTrend = {
  /** 최근 7일 일평균 백필 건수 (welfare + loan 합산) */
  avgPerDay: number;
  /** 7일 일별 합산 백필 건수 (cron 효과 추세 표시용) */
  daily: { day: string; added: number }[];
  /** 부족분 ÷ 일평균 = 100% 도달 예상 일수. avgPerDay 0이면 null */
  daysToFull: number | null;
};

export async function getInsightTrend7d(): Promise<InsightTrend> {
  try {
    const admin = createAdminClient();
    // welfare + loan unique_insight_at 7일 집계 — DB 측에서 일별 GROUP BY.
    // RPC 없음 → 두 테이블 일별 누적을 application 측 merge.
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [wRes, lRes] = await Promise.all([
      admin
        .from("welfare_programs")
        .select("unique_insight_at")
        .gte("unique_insight_at", since)
        .not("unique_insight_at", "is", null),
      admin
        .from("loan_programs")
        .select("unique_insight_at")
        .gte("unique_insight_at", since)
        .not("unique_insight_at", "is", null),
    ]);
    if (wRes.error || lRes.error) {
      return { avgPerDay: 0, daily: [], daysToFull: null };
    }
    const counts = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000);
      const key = d.toISOString().slice(0, 10);
      counts.set(key, 0);
    }
    for (const row of [...(wRes.data ?? []), ...(lRes.data ?? [])]) {
      const at = (row as { unique_insight_at?: string }).unique_insight_at;
      if (!at) continue;
      const key = at.slice(0, 10);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const daily = Array.from(counts.entries()).map(([day, added]) => ({ day, added }));
    const total7d = daily.reduce((s, d) => s + d.added, 0);
    const avgPerDay = Math.round(total7d / 7);
    // 부족분 = totalSum - filledSum (getInsightProgress 의 값 재사용 안 함 — 별도 호출)
    const progress = await getInsightProgress();
    const remaining =
      progress.welfare.total + progress.loan.total
        - progress.welfare.filled - progress.loan.filled;
    const daysToFull = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;
    return { avgPerDay, daily, daysToFull };
  } catch {
    return { avgPerDay: 0, daily: [], daysToFull: null };
  }
}
