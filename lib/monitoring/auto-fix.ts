// ============================================================
// Phase D-4: parser 자동 수정 logic (step 1 — dry-run)
// ============================================================
// 사장님 spec "vitest 통과 시 자동 commit·push" — ② 강력 모드 선택.
//
// 안전 단계:
//   step 1 (이번): 사고 감지 + fix 시도 dry-run. 실제 git push X. 텔레그램 보고만.
//   step 2 (별도 commit): LLM (Claude/GPT) 통합 + parser regex 자동 generation
//   step 3 (별도 commit): git 자동 commit·push + rollback 자동화
//
// dry-run 모드: env `D4_AUTO_FIX_ENABLED` 가 truthy 일 때만 활성화.
// 기본 false — 사장님 명시 활성화 후만 가동.
// ============================================================

import type { WeeklyMonitorReport } from "./weekly-scrape-monitor";

export type AutoFixAttempt = {
  trigger: string; // 어떤 사고가 trigger 했나
  domain: "suncheon" | "gwangju" | "unknown";
  action: "diagnose" | "regex_fix" | "ua_change" | "skip" | "manual_required";
  status: "dry_run" | "applied" | "failed" | "skipped";
  reason: string;
  // step 2 활성화 시 — 실제 변경 내역
  proposedChange?: string;
};

// D-4 auto-fix 활성화 여부 (env toggle)
export function isAutoFixEnabled(): boolean {
  const v = process.env.D4_AUTO_FIX_ENABLED;
  return v === "true" || v === "1";
}

// D-1 report 의 alerts 를 분석해서 자동 fix 가능한 영역 식별.
// step 1 dry-run: 시도 logic 만, 실제 fix X.
export function analyzeForAutoFix(
  report: WeeklyMonitorReport,
): AutoFixAttempt[] {
  const attempts: AutoFixAttempt[] = [];

  for (const city of report.cities) {
    // 1) 사이트 차단 의심 — parser fix 로 해결 안 됨 (사이트 자체 문제)
    if (city.siteBlockedSuspect) {
      attempts.push({
        trigger: `${city.city} 사이트 차단 의심`,
        domain: city.city === "순천시" ? "suncheon" : city.city === "광주광역시" ? "gwangju" : "unknown",
        action: "manual_required",
        status: "skipped",
        reason: "사이트 차단은 User-Agent 변경 또는 사이트 URL 점검 필요. 자동 fix 안전성 낮음.",
      });
      continue;
    }

    // 2) skipped 비율 > 50% — parser 실패 의심. step 2 에서 regex_fix 시도 대상.
    if (city.skippedRate > 0.5 && city.cronInserted + city.cronSkipped >= 10) {
      attempts.push({
        trigger: `${city.city} skipped 비율 ${Math.round(city.skippedRate * 100)}%`,
        domain: city.city === "순천시" ? "suncheon" : city.city === "광주광역시" ? "gwangju" : "unknown",
        action: "regex_fix",
        status: isAutoFixEnabled() ? "dry_run" : "skipped",
        reason: isAutoFixEnabled()
          ? "D-4 step 1 dry-run — step 2 LLM 통합 후 실제 fix 시도"
          : "D4_AUTO_FIX_ENABLED=false. env 활성화 후 dry-run 가동",
        proposedChange:
          "parser regex (parseDetailBody) 의 BODY_REGEX 변경. step 2 에서 LLM 으로 새 패턴 생성 + vitest 검증.",
      });
    }
  }

  // 3) scrape cron 누락 — 자동 fix 안전 영역 아님 (Vercel cron 자체 문제)
  if (report.scrapeMissingDays >= 2) {
    attempts.push({
      trigger: `scrape cron ${report.scrapeMissingDays}일 누락`,
      domain: "unknown",
      action: "manual_required",
      status: "skipped",
      reason: "Vercel cron 가동 문제 — env / 재배포 / 결제 등 다양한 원인. 자동 fix 위험.",
    });
  }

  return attempts;
}

// auto-fix 결과를 텔레그램 메시지 추가용으로 포맷
export function formatAutoFixSummary(attempts: AutoFixAttempt[]): string {
  if (attempts.length === 0) {
    return "";
  }
  const lines: string[] = [];
  lines.push("");
  lines.push("🤖 자동 fix 분석 (D-4):");
  for (const a of attempts.slice(0, 4)) {
    const statusIcon =
      a.status === "applied"
        ? "✅"
        : a.status === "dry_run"
          ? "🔬"
          : a.status === "failed"
            ? "❌"
            : "⏭️";
    lines.push(`  ${statusIcon} ${a.trigger}`);
    lines.push(`     → ${a.action} (${a.status}): ${a.reason}`);
  }
  return lines.join("\n");
}
