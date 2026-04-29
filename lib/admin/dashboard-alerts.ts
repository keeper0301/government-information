// lib/admin/dashboard-alerts.ts
// ============================================================
// 메인 대시보드 "지금 처리 필요" 배너 — 3 신호 (1차 plan 범위)
// ============================================================
// cron 실패 / press-ingest 적체 / 만료 탈퇴 미처리.
// 4번째 advisor security WARN 은 후속 plan (cache 전략 결정 후).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getPressIngestKpi } from "@/lib/press-ingest/filter";

export type DashboardAlert = {
  key: "cron_failure" | "press_ingest_backlog" | "deletions_overdue";
  label: string;
  count: number;
  href: string;
};

const PRESS_INGEST_BACKLOG_THRESHOLD = 30;

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 병렬 fetch — 외부 RPC 3회 (각 head:true count exact)
  const [cronRes, pressKpi, deletionsRes] = await Promise.all([
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24h),
    getPressIngestKpi(),
    admin
      .from("pending_deletions")
      .select("user_id", { count: "exact", head: true })
      .lt("scheduled_delete_at", nowIso),
  ]);

  const alerts: DashboardAlert[] = [];

  if ((cronRes.count ?? 0) >= 1) {
    alerts.push({
      key: "cron_failure",
      label: "cron 실패 알림",
      count: cronRes.count ?? 0,
      href: "/admin/cron-failures",
    });
  }

  if (pressKpi.candidates_24h >= PRESS_INGEST_BACKLOG_THRESHOLD) {
    alerts.push({
      key: "press_ingest_backlog",
      label: "광역 보도자료 후보 적체",
      count: pressKpi.candidates_24h,
      href: "/admin/press-ingest",
    });
  }

  if ((deletionsRes.count ?? 0) >= 1) {
    alerts.push({
      key: "deletions_overdue",
      label: "만료 탈퇴 미처리",
      count: deletionsRes.count ?? 0,
      href: "/admin#user-search",
    });
  }

  return alerts;
}
