// ============================================================
// D-4 step 5 — 자동 revert PR 생성
// ============================================================
// step 4 rollback 알림 (사고 재발 감지) → step 5 가 직전 step 3 PR 의
// regex swap 으로 revert PR 자동 생성. 사장님 1 클릭 merge → 사고 회복.
//
// 흐름:
//   step 3 merge → 사이트 정상 → 다음 주 사고 재발
//   → step 4 alert → step 5 revert PR (proposed → current swap)
//   → 사장님 모바일 텔레그램 → 1 클릭 merge → 원래 regex 복원
//
// env D4_AUTO_FIX_REVERT_ENABLED=true 일 때만 활성화. 기본 false.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createBranch,
  getFileContent,
  updateFile,
  createPullRequest,
} from "@/lib/git-bot/github-update";
import type { RollbackAlert } from "./auto-fix-rollback";

export type RevertResult = {
  rollbackAlert: RollbackAlert;
  revertPrUrl?: string;
  revertPrNumber?: number;
  error?: string;
};

export function isRevertEnabled(): boolean {
  const v = process.env.D4_AUTO_FIX_REVERT_ENABLED;
  return v === "true" || v === "1";
}

// 직전 cron audit 에서 step 3 PR 의 currentRegex/proposedRegex 정보 fetch.
// step 5 가 swap 으로 revert 시도하기 위함.
async function loadPreviousCommitProposals(): Promise<
  Array<{
    prNumber: number;
    domain: string;
    filePath: string;
    currentRegex: string;
    proposedRegex: string;
  }>
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "weekly_scrape_monitor_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !data.details || typeof data.details !== "object") return [];

  const d = data.details as Record<string, unknown>;
  const prs = Array.isArray(d.d4_step3_prs_detailed)
    ? d.d4_step3_prs_detailed
    : [];

  return prs
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const obj = p as Record<string, unknown>;
      const prNumber = Number(obj.pr);
      const domain = typeof obj.domain === "string" ? obj.domain : null;
      const filePath = typeof obj.filePath === "string" ? obj.filePath : null;
      const currentRegex =
        typeof obj.currentRegex === "string" ? obj.currentRegex : null;
      const proposedRegex =
        typeof obj.proposedRegex === "string" ? obj.proposedRegex : null;
      if (!prNumber || !domain || !filePath || !currentRegex || !proposedRegex)
        return null;
      return { prNumber, domain, filePath, currentRegex, proposedRegex };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

// rollback alert 1건 → 자동 revert PR 시도. 실패 graceful.
export async function revertAlertToPr(
  alert: RollbackAlert,
): Promise<RevertResult> {
  if (!isRevertEnabled()) {
    return { rollbackAlert: alert, error: "D4_AUTO_FIX_REVERT_ENABLED 비활성화" };
  }

  // 직전 PR 의 변경 정보 fetch
  const previousProposals = await loadPreviousCommitProposals();
  const matched = previousProposals.find(
    (p) => p.prNumber === alert.prNumber && p.domain === alert.domain,
  );
  if (!matched) {
    return {
      rollbackAlert: alert,
      error: "직전 PR 의 regex 정보가 audit 에 없음 (step 3 보강 후 적용)",
    };
  }

  try {
    // 1) 파일 현재 내용 fetch + swap (proposed → current)
    const { content, sha } = await getFileContent(matched.filePath);
    if (!content.includes(matched.proposedRegex)) {
      return {
        rollbackAlert: alert,
        error: "파일에 신규 regex 없음 — 이미 누군가 revert 했을 수 있음",
      };
    }
    const revertedContent = content.replace(
      matched.proposedRegex,
      matched.currentRegex,
    );

    // 2) branch 생성
    const dateStr = new Date().toISOString().slice(0, 10);
    const branchName = `auto-revert/${dateStr}-${alert.domain}-pr${alert.prNumber}`;
    await createBranch(branchName);

    // 3) file update
    await updateFile({
      filePath: matched.filePath,
      newContent: revertedContent,
      message: `revert(scraping/${alert.domain}): D-4 step 5 자동 revert PR #${alert.prNumber}

사고 재발 감지 (${alert.reason}). step 3 PR 의 regex 변경 자동 revert.

신규 → 기존: ${matched.proposedRegex.slice(0, 80)} → ${matched.currentRegex.slice(0, 80)}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`,
      branch: branchName,
      sha,
    });

    // 4) PR 생성
    const pr = await createPullRequest({
      branch: branchName,
      title: `[D-4 auto-revert] ${alert.domain} PR #${alert.prNumber} revert`,
      body: `## D-4 step 5 자동 revert PR

### 사고
${alert.reason}

### 직전 PR
#${alert.prNumber} (merge 후 사이트에서 사고 재발)

### 변경 (swap)
- 신규 regex → 옛 regex 복원:
  - \`${matched.proposedRegex}\` → \`${matched.currentRegex}\`

### 검토 권장
1. \`${matched.filePath}\` diff 확인
2. local vitest 실행 (\`npx vitest run __tests__/lib/scraping/\`)
3. 합리적이면 merge → 원래 작동 regex 복원

🤖 D-4 step 5 자동 revert (사고 재발 감지 → 자동 PR)`,
    });

    return {
      rollbackAlert: alert,
      revertPrUrl: pr.url,
      revertPrNumber: pr.number,
    };
  } catch (e) {
    return { rollbackAlert: alert, error: (e as Error).message };
  }
}

// 텔레그램 메시지 추가용
export function formatRevertResults(results: RevertResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = [];
  lines.push("");
  lines.push("⏪ D-4 step 5 (자동 revert PR):");
  for (const r of results.slice(0, 3)) {
    if (r.error) {
      lines.push(`  ❌ PR #${r.rollbackAlert.prNumber} revert 실패: ${r.error.slice(0, 200)}`);
    } else {
      lines.push(`  ✅ PR #${r.rollbackAlert.prNumber} → revert PR #${r.revertPrNumber}`);
      lines.push(`     ${r.revertPrUrl}`);
    }
  }
  return lines.join("\n");
}
