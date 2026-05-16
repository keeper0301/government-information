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
type AuditRow = {
  details: unknown;
  created_at: string | null;
};

function extractAdsenseRevenue(
  row: AuditRow,
): { earnings: number; currency: string } | null {
  if (!row.details || typeof row.details !== "object") return null;
  const d = row.details as Record<string, unknown>;
  // external_console_check_run 의 console 별 결과 안에 adsense kpis 있음
  const consoles = d.consoles ?? d.results;
  if (!consoles || typeof consoles !== "object") return null;
  const adsense = (consoles as Record<string, unknown>).adsense;
  if (!adsense || typeof adsense !== "object") return null;
  const kpis = (adsense as Record<string, unknown>).kpis;
  if (!kpis || typeof kpis !== "object") return null;
  const kpiObj = kpis as Record<string, unknown>;
  const earnings = Number(kpiObj.earnings_today);
  if (isNaN(earnings)) return null;
  const currency =
    typeof kpiObj.currency === "string" ? kpiObj.currency : "USD";
  return { earnings, currency };
}

// 직전 N일 audit fetch + 일별 매출 추출.
export async function collectRevenueTrend(
  days = 7,
): Promise<RevenueTrend> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 2 * 24 * 3600_000).toISOString();

  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "external_console_check_run")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(days * 4); // 안전 margin (cron 가동 가변성)

  const daily: DailyRevenue[] = [];
  let currency = "USD";
  const seenDates = new Set<string>();

  // 가장 최근 row → 가장 이전 row 순회. 일별 가장 최근 데이터 채택.
  for (const row of (data ?? []) as AuditRow[]) {
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
