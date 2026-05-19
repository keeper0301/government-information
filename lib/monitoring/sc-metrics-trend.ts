// ============================================================
// Search Console KPI — autonomous hub 가시화
// ============================================================
// external-console-check cron (KST 09:30) 의 admin_actions audit details 에서
// Search Console kpis 추출 — clicks/impressions/CTR/avg_position 4 metric.
//
// 어제 AdSense 통과 직후 색인·노출 트래픽 추적에 가장 가치 ↑.
// AdSense 카드와 같은 패턴 (extractKpisByConsole helper 재사용).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractKpisByConsole,
  type AuditRow,
} from "@/lib/monitoring/adsense-revenue-trend";

export type ScMetricsLatest = {
  clicks: number;
  impressions: number;
  /** 0~1 분수형 (0.005 = 0.5%) */
  ctr: number;
  /** 평균 검색 순위 (낮을수록 좋음) */
  avgPosition: number;
  /** 측정 시각 (UTC ISO). null = 데이터 없음 */
  observedAt: string | null;
};

// row 1건 → ScMetricsLatest 변환 (pure function, 단위 테스트용).
// audit kpis 부재 시 null. clicks 키 자체 없으면 valid kpis 아님 (skip).
export function extractScMetricsFromRow(
  row: AuditRow,
): ScMetricsLatest | null {
  const k = extractKpisByConsole(row, "search_console");
  if (!k) return null;
  if (!("clicks" in k)) return null;
  const clicks = Number(k.clicks ?? 0);
  if (Number.isNaN(clicks)) return null;
  return {
    clicks,
    impressions: Number(k.impressions ?? 0),
    ctr: Number(k.ctr ?? 0),
    avgPosition: Number(k.avg_position ?? 0),
    observedAt: row.created_at ?? null,
  };
}

export async function collectScMetricsLatest(): Promise<ScMetricsLatest | null> {
  // 2026-05-19 — supabase query throw 시 hub 페이지 500 차단. null 로 graceful skip (카드 hide).
  let data: AuditRow[] | null = null;
  try {
    const admin = createAdminClient();
    // 7일 신선도 가드 — cron 1주+ 멈춤 시 옛 데이터 misleading 차단.
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const res = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "external_console_check_run")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    data = (res.data ?? []) as AuditRow[];
  } catch (e) {
    console.error("[sc-metrics-trend] collectScMetricsLatest failed", e);
    return null;
  }

  for (const row of data ?? []) {
    const metrics = extractScMetricsFromRow(row);
    if (metrics) return metrics;
  }
  return null;
}
