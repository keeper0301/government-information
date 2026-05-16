// ============================================================
// D-4 step 4 — rollback 감지 + 알림
// ============================================================
// 직전 주 D-4 step 3 가 PR 생성 → 사장님 merge → 이번 주 cron 가동 시
// 같은 도시의 사고 재발 (skippedRate 다시 ↑) 감지 시 rollback 권고.
//
// 자동 revert PR 생성은 안 함 (audit 보강 + GitHub commits API 복잡).
// 대신 사장님에게 PR link + "Revert this PR" 1 클릭 가이드 텔레그램 알림.
// GitHub PR 페이지에 "Revert" 버튼 있음 — 사장님 1 클릭으로 revert PR 자동 생성.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { WeeklyMonitorReport } from "./weekly-scrape-monitor";

type PreviousMergedPR = {
  prNumber: number;
  branch: string;
  domain: string;
  cronCreatedAt: string;
};

// 직전 cron audit 에서 D-4 step 3 PR 정보 fetch
async function loadPreviousMergedPRs(): Promise<PreviousMergedPR[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "weekly_scrape_monitor_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !data.details || typeof data.details !== "object") return [];

  const d = data.details as Record<string, unknown>;
  const prs = Array.isArray(d.d4_step3_prs) ? d.d4_step3_prs : [];

  return prs
    .map((p): PreviousMergedPR | null => {
      if (!p || typeof p !== "object") return null;
      const obj = p as Record<string, unknown>;
      const prNum = Number(obj.pr);
      const branch = typeof obj.branch === "string" ? obj.branch : null;
      const domain = typeof obj.domain === "string" ? obj.domain : null;
      if (!prNum || !branch || !domain) return null;
      return {
        prNumber: prNum,
        branch,
        domain,
        cronCreatedAt: String(data.created_at ?? ""),
      };
    })
    .filter((p): p is PreviousMergedPR => p !== null);
}

export type RollbackAlert = {
  prNumber: number;
  domain: string;
  currentSkippedRate: number;
  reason: string;
  revertGuideUrl: string; // GitHub PR 의 Revert 버튼 가이드 url
};

// 직전 PR + 이번 주 cron 결과 비교 → rollback 권고 분석.
// 같은 도시에서 사고 재발하면 alert.
export async function analyzeRollback(
  thisWeekReport: WeeklyMonitorReport,
): Promise<RollbackAlert[]> {
  const alerts: RollbackAlert[] = [];
  const previousPRs = await loadPreviousMergedPRs();
  if (previousPRs.length === 0) return alerts;

  const owner = process.env.GITHUB_REPO_OWNER ?? "keeper0301";
  const repo = process.env.GITHUB_REPO_NAME ?? "government-information";

  for (const pr of previousPRs) {
    const city = thisWeekReport.cities.find((c) => {
      const cityKey = c.city === "순천시" ? "suncheon" :
                       c.city === "광주광역시" ? "gwangju" : c.city;
      return cityKey === pr.domain;
    });
    if (!city) continue;

    // 사고 재발 조건:
    //   - skippedRate > 50% (직전 PR fix 가 작동 안 함)
    //   - 또는 siteBlockedSuspect (사이트 자체 차단)
    if (
      (city.skippedRate > 0.5 && city.cronInserted + city.cronSkipped >= 10) ||
      city.siteBlockedSuspect
    ) {
      alerts.push({
        prNumber: pr.prNumber,
        domain: pr.domain,
        currentSkippedRate: city.skippedRate,
        reason: city.siteBlockedSuspect
          ? "사이트 차단 의심 재발"
          : `skipped 비율 ${Math.round(city.skippedRate * 100)}% (직전 fix 작동 안 함)`,
        revertGuideUrl: `https://github.com/${owner}/${repo}/pull/${pr.prNumber}`,
      });
    }
  }

  return alerts;
}

// 텔레그램 메시지 추가용
export function formatRollbackAlerts(alerts: RollbackAlert[]): string {
  if (alerts.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("🔄 D-4 step 4 (rollback 권고):");
  for (const a of alerts.slice(0, 3)) {
    lines.push(`  ⚠️ ${a.domain} 사고 재발 — 직전 PR #${a.prNumber} 의심`);
    lines.push(`     사유: ${a.reason}`);
    lines.push(`     ${a.revertGuideUrl}`);
    lines.push(`     → GitHub PR 페이지의 "Revert" 버튼 1 클릭으로 revert PR 자동 생성`);
  }
  return lines.join("\n");
}
