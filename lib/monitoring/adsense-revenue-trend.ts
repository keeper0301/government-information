// ============================================================
// AdSense 매출 7일 추세 — Phase D 매출 추적 도메인
// ============================================================
// external-console-check cron (매일 KST 09:30) 의 admin_actions audit details
// 에서 AdSense earnings_today 누적 추출 → 7일 추세 + ↓ alert.
//
// /admin/autonomous Phase 3 카드 + autonomous hub 의 매출 가시화.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type DailyRevenue = {
  date: string; // YYYY-MM-DD
  earnings: number;
  currency: string;
};

export type RevenueTrend = {
  daily: DailyRevenue[];
  total7d: number;
  avgPerDay: number;
  currency: string;
  // 직전 7일 대비 추세 (전전 7일 데이터 있으면)
  vsPrev7d: { delta: number; deltaPct: number } | null;
  alerts: string[];
};

// audit details 에서 AdSense kpis 추출 — 안전한 fallback.
export type AuditRow = {
  details: unknown;
  created_at: string | null;
};

function extractAdsenseRevenue(
  row: AuditRow,
): { earnings: number; currency: string } | null {
  const kpiObj = extractAdsenseKpis(row);
  if (!kpiObj) return null;
  const earnings = Number(kpiObj.earnings_today);
  if (Number.isNaN(earnings)) return null;
  const currency =
    typeof kpiObj.currency === "string" ? kpiObj.currency : "USD";
  return { earnings, currency };
}

// audit details.results_summary 는 array — [{ console, alerts_count, alert_keys, kpis, error }, ...].
// console 이름으로 매칭하여 해당 kpis 추출. 다른 console (SC/GA4/Vercel 등) 도 재사용.
// 2026-05-19 — 옛 `consoles.<name>` schema 가정으로 작성된 버그 fix (5/14 이후 모두 results_summary).
export function extractKpisByConsole(
  row: AuditRow,
  consoleName: string,
): Record<string, unknown> | null {
  if (!row.details || typeof row.details !== "object") return null;
  const d = row.details as Record<string, unknown>;
  const summary = d.results_summary;
  if (!Array.isArray(summary)) return null;
  for (const item of summary) {
    if (!item || typeof item !== "object") continue;
    const itemObj = item as Record<string, unknown>;
    if (itemObj.console !== consoleName) continue;
    const kpis = itemObj.kpis;
    return kpis && typeof kpis === "object"
      ? (kpis as Record<string, unknown>)
      : null;
  }
  return null;
}

function extractAdsenseKpis(row: AuditRow): Record<string, unknown> | null {
  return extractKpisByConsole(row, "adsense");
}

// 직전 N일 모든 일별 매출 (autonomous hub 30일 차트 등).
// total7d/vsPrev7d 와 별개 — 단순 일별 데이터 list 반환.
export async function collectRevenueDailySeries(
  days = 30,
): Promise<DailyRevenue[]> {
  // 2026-05-19 — supabase query throw 시 hub 페이지 500 차단. 빈 array 로 graceful skip.
  let data: AuditRow[] | null = null;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
    const res = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "external_console_check_run")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(days * 3);
    data = (res.data ?? []) as AuditRow[];
  } catch (e) {
    console.error("[adsense-revenue-trend] collectRevenueDailySeries failed", e);
    return [];
  }

  const daily: DailyRevenue[] = [];
  const seenDates = new Set<string>();

  for (const row of data ?? []) {
    const revenue = extractAdsenseRevenue(row);
    if (!revenue) continue;
    const date = (row.created_at ?? "").slice(0, 10);
    if (!date || seenDates.has(date)) continue;
    seenDates.add(date);
    daily.push({
      date,
      earnings: revenue.earnings,
      currency: revenue.currency,
    });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  return daily;
}

// 직전 N일 audit fetch + 일별 매출 추출.
export async function collectRevenueTrend(
  days = 7,
): Promise<RevenueTrend> {
  // 2026-05-19 — supabase query throw 시 hub 페이지 500 차단. 빈 trend 로 graceful skip.
  let data: AuditRow[] | null = null;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * 2 * 24 * 3600_000).toISOString();
    const res = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "external_console_check_run")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(days * 4); // 안전 margin (cron 가동 가변성)
    data = (res.data ?? []) as AuditRow[];
  } catch (e) {
    console.error("[adsense-revenue-trend] collectRevenueTrend failed", e);
    return {
      daily: [],
      total7d: 0,
      avgPerDay: 0,
      currency: "USD",
      vsPrev7d: null,
      alerts: [],
    };
  }

  const daily: DailyRevenue[] = [];
  let currency = "USD";
  const seenDates = new Set<string>();

  // 가장 최근 row → 가장 이전 row 순회. 일별 가장 최근 데이터 채택.
  for (const row of data ?? []) {
    const revenue = extractAdsenseRevenue(row);
    if (!revenue) continue;
    const date = (row.created_at ?? "").slice(0, 10);
    if (!date || seenDates.has(date)) continue;
    seenDates.add(date);
    daily.push({
      date,
      earnings: revenue.earnings,
      currency: revenue.currency,
    });
    currency = revenue.currency;
  }

  // 날짜순 정렬 (옛 → 최근)
  daily.sort((a, b) => a.date.localeCompare(b.date));

  const recent7 = daily.slice(-days);
  const prev7 = daily.slice(-days * 2, -days);

  const total7d = recent7.reduce((s, d) => s + d.earnings, 0);
  const totalPrev7d = prev7.reduce((s, d) => s + d.earnings, 0);
  const avgPerDay = recent7.length > 0 ? total7d / recent7.length : 0;

  let vsPrev7d: RevenueTrend["vsPrev7d"] = null;
  if (prev7.length > 0) {
    const delta = total7d - totalPrev7d;
    const deltaPct = totalPrev7d > 0 ? (delta / totalPrev7d) * 100 : 0;
    vsPrev7d = { delta, deltaPct };
  }

  const alerts: string[] = [];
  if (vsPrev7d && vsPrev7d.deltaPct < -30) {
    alerts.push(
      `💸 AdSense 매출 7일 대비 ${vsPrev7d.deltaPct.toFixed(1)}% 감소 (${currency} ${total7d.toFixed(2)} / 직전 ${totalPrev7d.toFixed(2)})`,
    );
  }
  if (recent7.length >= 3 && recent7.slice(-3).every((d) => d.earnings === 0)) {
    alerts.push("💸 AdSense 최근 3일 연속 매출 0 — 광고 단위 또는 트래픽 점검 필요");
  }

  return {
    daily: recent7,
    total7d,
    avgPerDay,
    currency,
    vsPrev7d,
    alerts,
  };
}

// 2026-05-19 — 가장 최근 external-console-check audit 에서 AdSense 광고 성능 metric 추출.
// 매출 외 impressions·clicks·CTR·ad_requests·ready_since_hours 표시 (첫 24h 광고 성능 추적).
export type AdsenseMetricsLatest = {
  earnings: number;
  currency: string;
  impressions: number | null;
  clicks: number | null;
  adRequests: number | null;
  pageViews: number | null;
  ctrPct: number | null;
  readySinceHours: number | null;
  /** 측정 시각 (UTC ISO). null = 데이터 없음 */
  observedAt: string | null;
};

// row 1건 → AdsenseMetricsLatest 변환 (pure function, 단위 테스트용).
// audit kpis 부재 시 null. earnings_today 누락 시에도 null (NOT_FOUND row 처리).
export function extractAdsenseMetricsFromRow(
  row: AuditRow,
): AdsenseMetricsLatest | null {
  const k = extractAdsenseKpis(row);
  if (!k) return null;
  // earnings_today 키 자체가 없으면 valid kpis 아님 (NOT_FOUND/empty row skip).
  if (!("earnings_today" in k)) return null;
  const earnings = Number(k.earnings_today ?? 0);
  if (Number.isNaN(earnings)) return null;
  return {
    earnings,
    currency: typeof k.currency === "string" ? k.currency : "KRW",
    impressions: nullableNumber(k.impressions),
    clicks: nullableNumber(k.clicks),
    adRequests: nullableNumber(k.ad_requests),
    pageViews: nullableNumber(k.page_views),
    ctrPct: nullableNumber(k.ctr_pct),
    readySinceHours: nullableNumber(k.ready_since_hours),
    observedAt: row.created_at ?? null,
  };
}

export async function collectAdsenseMetricsLatest(): Promise<AdsenseMetricsLatest | null> {
  // 2026-05-19 — supabase query throw 시 hub 페이지 500 차단. null 로 graceful skip (카드 hide).
  let data: AuditRow[] | null = null;
  try {
    const admin = createAdminClient();
    // 7일 신선도 가드 — cron 1주+ 멈춤 시 옛 데이터 misleading 표시 차단.
    // external-console-check 매일 가동 (KST 09:30) 이라 7일 안전 margin.
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
    console.error("[adsense-revenue-trend] collectAdsenseMetricsLatest failed", e);
    return null;
  }

  for (const row of data ?? []) {
    const metrics = extractAdsenseMetricsFromRow(row);
    if (metrics) return metrics;
  }
  return null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

// 텔레그램 메시지 추가용
export function formatRevenueTrend(trend: RevenueTrend): string {
  if (trend.daily.length === 0) {
    return "💸 AdSense 매출 데이터 없음 (external-console-check cron 미가동)";
  }

  const lines: string[] = [];
  lines.push(
    `💸 AdSense 7일 매출: ${trend.currency} ${trend.total7d.toFixed(2)} (평균 ${trend.avgPerDay.toFixed(2)}/일)`,
  );
  if (trend.vsPrev7d) {
    const sign =
      trend.vsPrev7d.delta > 0 ? "+" : trend.vsPrev7d.delta < 0 ? "" : "±";
    lines.push(
      `   직전 7일 대비 ${sign}${trend.vsPrev7d.delta.toFixed(2)} (${trend.vsPrev7d.deltaPct.toFixed(1)}%)`,
    );
  }
  for (const alert of trend.alerts) {
    lines.push(`   ${alert}`);
  }
  return lines.join("\n");
}
