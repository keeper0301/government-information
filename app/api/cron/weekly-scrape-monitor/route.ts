// ============================================================
// /api/cron/weekly-scrape-monitor — Phase D-1 1주 진단 cron
// ============================================================
// 매주 월 KST 09:30 (UTC 일요일 00:30) 실행.
// 시·군 보도자료 수집 7일 metric → 사고 신호 분석 → 텔레그램 알림.
//
// auth: CRON_SECRET Bearer.
// ============================================================

import { NextResponse } from "next/server";
import {
  collectWeeklyMonitor,
  formatWeeklyReport,
} from "@/lib/monitoring/weekly-scrape-monitor";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authErr = await authorize(request);
  if (authErr) return authErr;

  try {
    const report = await collectWeeklyMonitor();
    const message = formatWeeklyReport(report);

    // 텔레그램 알림 — 사고 있으면 즉시, 사고 0 도 매주 1회 정상 보고 (사장님 운영 가시화)
    const telegram = await sendOpsAlertTelegram({
      subject: report.alerts.length > 0
        ? "🚨 시·군 수집 사고 신호"
        : "📊 시·군 수집 1주 정상 보고",
      message,
    });

    // D-3 학습 — report 전체 audit 보존 (다음 주 비교용)
    await auditCronRun("weekly_scrape_monitor_run", {
      alerts_count: report.alerts.length,
      recommendations_count: report.recommendations.length,
      repeating_alerts: report.trend.repeatingAlerts.length,
      sajang_suncheon_welfare: report.districtMatching.sajangSuncheonWelfare,
      sajang_delta: report.trend.sajangSuncheonDelta,
      telegram_sent: telegram.ok,
      report, // 다음 주 비교용 전체 snapshot
    });

    return NextResponse.json({
      ok: true,
      report,
      telegram_sent: telegram.ok,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const POST = GET;
