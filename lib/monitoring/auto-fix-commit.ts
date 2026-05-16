// ============================================================
// D-4 step 3 — RegexProposal → GitHub branch + PR 자동 생성
// ============================================================
// step 2 (LLM 제안) + sample 매칭 성공 → 실제 file 변경 + PR.
// 사장님 1 클릭 merge link 텔레그램 알림.
//
// env D4_AUTO_FIX_COMMIT_ENABLED=true 일 때만 가동.
// ============================================================

import type { RegexProposal } from "./llm-regex-fix";
import {
  createBranch,
  getFileContent,
  updateFile,
  createPullRequest,
} from "@/lib/git-bot/github-update";

export type CommitProposalResult = {
  domain: string;
  fnName: string;
  filePath: string;
  branch: string;
  prUrl: string;
  prNumber: number;
} | {
  error: string;
};

export function isCommitEnabled(): boolean {
  const v = process.env.D4_AUTO_FIX_COMMIT_ENABLED;
  return v === "true" || v === "1";
}

// domain 별 파일 경로 매핑
const DOMAIN_FILE_PATH: Record<string, string> = {
  suncheon: "lib/scraping/local-press/suncheon.ts",
  gwangju: "lib/scraping/local-press/gwangju.ts",
};

// 신규 regex 로 file content 치환. fnName 기반 BODY_REGEX 변수 찾기.
// 변경 안 되면 null 반환 (현재 regex 없음 = 사이트 코드 패턴 변경).
function replaceRegexInFile(
  content: string,
  currentRegex: string,
  newRegex: string,
): string | null {
  // 정규식 변수 선언 안에서 currentRegex 찾기.
  // 예: const BODY_REGEX = /<div\s+class="content"\s*>([\s\S]*?)<\/div>/;
  // currentRegex 가 정확히 일치해야 함 (부분 일치 X — 잘못된 곳 교체 사고 방지)
  if (!content.includes(currentRegex)) return null;
  const replaced = content.replace(currentRegex, newRegex);
  return replaced === content ? null : replaced;
}

// 진짜 commit 시도 — branch 생성 + file update + PR.
// 실패 graceful — error 반환 (cron 가동 멈추면 안 됨).
export async function commitRegexProposal(
  proposal: RegexProposal,
): Promise<CommitProposalResult> {
  if (!isCommitEnabled()) {
    return { error: "D4_AUTO_FIX_COMMIT_ENABLED 비활성화" };
  }
  if (!proposal.sampleMatchTested) {
    return { error: "sample 매칭 실패 — commit 차단" };
  }

  const filePath = DOMAIN_FILE_PATH[proposal.domain];
  if (!filePath) {
    return { error: `unknown domain: ${proposal.domain}` };
  }

  try {
    // 1) 현재 파일 fetch + 정규식 치환 시도 (실제 변경 가능한지 사전 검증)
    const { content: currentContent, sha } = await getFileContent(filePath);
    const newContent = replaceRegexInFile(
      currentContent,
      proposal.currentRegex,
      proposal.proposedRegex,
    );
    if (!newContent) {
      return {
        error: "현재 regex 가 파일에 없음 (사이트 코드 패턴 변경 가능)",
      };
    }

    // 2) branch 생성 (날짜+도메인+fn)
    const dateStr = new Date().toISOString().slice(0, 10);
    const branchName = `auto-fix/${dateStr}-${proposal.domain}-${proposal.fnName}`;
    await createBranch(branchName);

    // 3) file update (branch 에 commit)
    const commitMessage = `fix(scraping/${proposal.domain}): D-4 auto-fix parser regex

${proposal.reason}

기존: ${proposal.currentRegex.slice(0, 80)}
신규: ${proposal.proposedRegex.slice(0, 80)}

LLM 자동 제안 + sample 매칭 검증 통과. 사장님 1 클릭 merge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
    await updateFile({
      filePath,
      newContent,
      message: commitMessage,
      branch: branchName,
      sha,
    });

    // 4) PR 생성
    const pr = await createPullRequest({
      branch: branchName,
      title: `[D-4 auto-fix] ${proposal.domain} parser regex 갱신`,
      body: `## D-4 자동 fix PR

### 도메인
${proposal.domain} (${proposal.fnName})

### 변경
- 기존 regex: \`${proposal.currentRegex}\`
- 신규 regex: \`${proposal.proposedRegex}\`

### LLM 분석
${proposal.reason}

### 검증
- sample 매칭: ✅ 성공
- 추출 sample: \`${(proposal.sampleExtract ?? "").slice(0, 100)}\`

### 검토 권장
1. \`${filePath}\` diff 확인
2. local vitest 실행 (\`npx vitest run __tests__/lib/scraping/\`)
3. 합리적이면 merge → master 직접 push 와 동일 효과

🤖 D-4 step 3 LLM 자동 생성 PR`,
    });

    return {
      domain: proposal.domain,
      fnName: proposal.fnName,
      filePath,
      branch: branchName,
      prUrl: pr.url,
      prNumber: pr.number,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// 텔레그램 메시지 추가용 — PR link 사장님 1 클릭
export function formatCommitResults(results: CommitProposalResult[]): string {
  const success = results.filter((r): r is Extract<CommitProposalResult, { prUrl: string }> => "prUrl" in r);
  const failures = results.filter((r): r is Extract<CommitProposalResult, { error: string }> => "error" in r);

  if (success.length === 0 && failures.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("🚀 D-4 step 3 (PR 자동 생성):");

  for (const s of success) {
    lines.push(`  ✅ ${s.domain} → PR #${s.prNumber}`);
    lines.push(`     ${s.prUrl}`);
  }
  for (const f of failures.slice(0, 2)) {
    lines.push(`  ❌ PR 생성 실패: ${f.error.slice(0, 200)}`);
  }
  return lines.join("\n");
}
