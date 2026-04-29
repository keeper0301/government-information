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
  // 한 RPC 실패 시 다른 신호 보존 (partial result 패턴)
  // 예: getPressIngestKpi() 가 throw 해도 cron / deletions 신호는 그대로 노출
  const results = await Promise.allSettled([
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

  const [cronSettled, pressSettled, deletionsSettled] = results;

  const alerts: DashboardAlert[] = [];

  // cron 실패 알림 — fulfilled 만 평가, rejected 면 console.warn 후 skip
  if (cronSettled.status === "fulfilled" && (cronSettled.value.count ?? 0) >= 1) {
    alerts.push({
      key: "cron_failure",
      label: "cron 실패 알림",
      count: cronSettled.value.count ?? 0,
      href: "/admin/cron-failures",
    });
  } else if (cronSettled.status === "rejected") {
    console.warn("[dashboard-alerts] cron_failure_log fetch 실패:", cronSettled.reason);
  }

  // press-ingest 광역 보도자료 후보 적체
  if (
    pressSettled.status === "fulfilled" &&
    pressSettled.value.candidates_24h >= PRESS_INGEST_BACKLOG_THRESHOLD
  ) {
    alerts.push({
      key: "press_ingest_backlog",
      label: "광역 보도자료 후보 적체",
      count: pressSettled.value.candidates_24h,
      href: "/admin/press-ingest",
    });
  } else if (pressSettled.status === "rejected") {
    console.warn("[dashboard-alerts] getPressIngestKpi 실패:", pressSettled.reason);
  }

  // 만료 탈퇴 미처리
  if (deletionsSettled.status === "fulfilled" && (deletionsSettled.value.count ?? 0) >= 1) {
    alerts.push({
      key: "deletions_overdue",
      label: "만료 탈퇴 미처리",
      count: deletionsSettled.value.count ?? 0,
      href: "/admin#user-search",
    });
  } else if (deletionsSettled.status === "rejected") {
    console.warn("[dashboard-alerts] pending_deletions fetch 실패:", deletionsSettled.reason);
  }

  return alerts;
}
