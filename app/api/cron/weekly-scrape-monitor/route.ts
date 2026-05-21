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
import {
  analyzeForAutoFix,
  formatAutoFixSummary,
  isAutoFixEnabled,
} from "@/lib/monitoring/auto-fix";
import {
  executeAllAutoFixAttempts,
  formatAutoFixResults,
} from "@/lib/monitoring/auto-fix-integration";
import {
  commitRegexProposal,
  formatCommitResults,
  isCommitEnabled,
} from "@/lib/monitoring/auto-fix-commit";
import {
  analyzeRollback,
  formatRollbackAlerts,
} from "@/lib/monitoring/auto-fix-rollback";
import {
  revertAlertToPr,
  formatRevertResults,
  isRevertEnabled,
} from "@/lib/monitoring/auto-fix-revert";
import {
  collectRevenueTrend,
  formatRevenueTrend,
} from "@/lib/monitoring/adsense-revenue-trend";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authErr = authorizeCronRequest(request);
  if (authErr) return authErr;

  try {
    const report = await collectWeeklyMonitor();
    const baseMessage = formatWeeklyReport(report);

    // D-4 step 1 — auto-fix 분석 (dry-run, 실제 변경 X)
    const autoFixAttempts = analyzeForAutoFix(report);
    const autoFixSummary = formatAutoFixSummary(autoFixAttempts);

    // D-4 step 2 — LLM regex 제안 (env D4_AUTO_FIX_LLM_ENABLED 일 때만 LLM 호출)
    const autoFixResults = await executeAllAutoFixAttempts(autoFixAttempts);
    const autoFixLlmSummary = formatAutoFixResults(autoFixResults);

    // D-4 step 3 — 매칭 성공 proposal 만 PR 생성 (env D4_AUTO_FIX_COMMIT_ENABLED 일 때만)
    const commitResults = isCommitEnabled()
      ? await Promise.all(
          autoFixResults
            .filter((r) => r.proposal && r.proposal.sampleMatchTested)
            .map((r) => commitRegexProposal(r.proposal!)),
        )
      : [];
    const commitSummary = formatCommitResults(commitResults);

    // D-4 step 4 — 직전 주 PR 후 사고 재발 감지 → rollback 권고
    const rollbackAlerts = await analyzeRollback(report);
    const rollbackSummary = formatRollbackAlerts(rollbackAlerts);

    // D-4 step 5 — rollback alert 별 자동 revert PR (env D4_AUTO_FIX_REVERT_ENABLED 일 때만)
    const revertResults = isRevertEnabled()
      ? await Promise.all(rollbackAlerts.map((a) => revertAlertToPr(a)))
      : [];
    const revertSummary = formatRevertResults(revertResults);

    // Phase D 매출 추세 — AdSense 7일 추세 + ↓ alert
    const revenueTrend = await collectRevenueTrend(7);
    const revenueSummary = "\n\n" + formatRevenueTrend(revenueTrend);

    const message =
      baseMessage +
      autoFixSummary +
      autoFixLlmSummary +
      commitSummary +
      rollbackSummary +
      revertSummary +
      revenueSummary;

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
      d4_auto_fix_enabled: isAutoFixEnabled(),
      d4_auto_fix_attempts: autoFixAttempts.length,
      d4_auto_fix_results: autoFixAttempts.map((a) => ({
        trigger: a.trigger,
        action: a.action,
        status: a.status,
      })),
      d4_step2_proposals: autoFixResults
        .filter((r) => r.proposal)
        .map((r) => ({
          domain: r.proposal!.domain,
          matched: r.proposal!.sampleMatchTested,
          reason: r.proposal!.reason.slice(0, 200),
        })),
      d4_step2_errors: autoFixResults
        .filter((r) => r.error)
        .map((r) => ({ domain: r.attempt.domain, error: r.error })),
      d4_step3_prs: commitResults
        .filter((r): r is Extract<typeof r, { prUrl: string }> => "prUrl" in r)
        .map((r) => ({ pr: r.prNumber, branch: r.branch, domain: r.domain })),
      // step 5 revert 위해 currentRegex / proposedRegex 도 보존
      d4_step3_prs_detailed: commitResults
        .filter((r): r is Extract<typeof r, { prUrl: string }> => "prUrl" in r)
        .map((r) => ({
          pr: r.prNumber,
          branch: r.branch,
          domain: r.domain,
          filePath: r.filePath,
          currentRegex: r.currentRegex,
          proposedRegex: r.proposedRegex,
        })),
      d4_step3_errors: commitResults
        .filter((r): r is Extract<typeof r, { error: string }> => "error" in r)
        .map((r) => ({ error: r.error })),
      d4_step4_rollback_alerts: rollbackAlerts.map((a) => ({
        pr: a.prNumber,
        domain: a.domain,
        reason: a.reason,
      })),
      d4_step5_revert_prs: revertResults
        .filter((r) => r.revertPrNumber)
        .map((r) => ({
          original_pr: r.rollbackAlert.prNumber,
          revert_pr: r.revertPrNumber,
          domain: r.rollbackAlert.domain,
        })),
      d4_step5_revert_errors: revertResults
        .filter((r) => r.error)
        .map((r) => ({ pr: r.rollbackAlert.prNumber, error: r.error })),
      adsense_revenue_7d: revenueTrend.total7d,
      adsense_revenue_currency: revenueTrend.currency,
      adsense_revenue_alerts: revenueTrend.alerts.length,
      report, // 다음 주 비교용 전체 snapshot
    });

    return NextResponse.json({
      ok: true,
      report,
      auto_fix_attempts: autoFixAttempts,
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
