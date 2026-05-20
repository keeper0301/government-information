// ============================================================
// cron 실패 24h summary (2026-05-22)
// ============================================================
// /admin/cron-failures 페이지가 있지만 autonomous hub 카드 형식.
// 사장님 매일 PC 점검 시 한 화면 가시화.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type CronFailureRecent = {
  jobName: string;
  occurrences: number;
  lastSeenAt: string; // ISO
  errorMessage: string | null;
};

export type CronFailureStats = {
  count24h: number; // unique signature
  totalOccurrences24h: number; // 합산 occurrences
  recent: CronFailureRecent[]; // 최근 5건
  observedAt: string;
};

export async function getCronFailureStats(): Promise<CronFailureStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, count } = await admin
    .from("cron_failure_log")
    .select("job_name, occurrences, last_seen_at, error_message", {
      count: "exact",
    })
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  const recent: CronFailureRecent[] = (data ?? []).map((row) => ({
    jobName: (row as { job_name: string }).job_name,
    occurrences: (row as { occurrences: number }).occurrences ?? 1,
    lastSeenAt: (row as { last_seen_at: string }).last_seen_at,
    errorMessage:
      ((row as { error_message: string | null }).error_message ?? "")?.slice(
        0,
        120,
      ) || null,
  }));

  const totalOccurrences24h = recent.reduce((s, r) => s + r.occurrences, 0);

  return {
    count24h: count ?? 0,
    totalOccurrences24h,
    recent,
    observedAt: new Date().toISOString(),
  };
}
