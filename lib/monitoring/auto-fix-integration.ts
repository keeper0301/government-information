// ============================================================
// D-4 step 2 — auto-fix LLM 통합 (cron route 가 호출)
// ============================================================
// D-4 step 1 (analyzeForAutoFix) 결과의 regex_fix attempt 마다:
//   1) 사이트 sample HTML fetch
//   2) LLM 으로 새 regex 제안
//   3) sample 매칭 시도 → 결과 RegexProposal 반환
//
// env D4_AUTO_FIX_LLM_ENABLED=true 일 때만 가동.
// 실제 파일 변경 X — step 3 (git 자동화) 별도.
// ============================================================

import type { AutoFixAttempt } from "./auto-fix";
import {
  isLlmFixEnabled,
  proposeRegexFix,
  type RegexProposal,
} from "./llm-regex-fix";
import {
  fetchPage as fetchSuncheon,
  SUNCHEON_LIST_URL,
} from "@/lib/scraping/local-press/suncheon";
import {
  fetchPage as fetchGwangju,
  GWANGJU_LIST_URL,
} from "@/lib/scraping/local-press/gwangju";

// domain 별 sample URL + parser 정보 매핑.
// 새 사이트 추가 시 여기 등록 + lib/scraping/local-press/*.ts 신규.
const DOMAIN_SOURCES = {
  suncheon: {
    listUrl: SUNCHEON_LIST_URL,
    fetcher: fetchSuncheon,
    // 현재 parseDetailBody regex (lib/scraping/local-press/suncheon.ts)
    currentBodyRegex: '<div\\s+class="content"\\s*>([\\s\\S]*?)</div>',
    target: "보도자료 본문 텍스트",
  },
  gwangju: {
    listUrl: GWANGJU_LIST_URL,
    fetcher: fetchGwangju,
    currentBodyRegex:
      '<div\\s+class="board_view_content[^"]*"[^>]*>([\\s\\S]*?)</div>',
    target: "보도자료 본문 텍스트",
  },
} as const;

export type AutoFixExecutionResult = {
  attempt: AutoFixAttempt;
  proposal: RegexProposal | null;
  error: string | null;
};

// AutoFixAttempt 1건 처리 — LLM 호출 가능하면 호출, 아니면 그대로 반환.
export async function executeAutoFixAttempt(
  attempt: AutoFixAttempt,
): Promise<AutoFixExecutionResult> {
  // LLM 활성화 안 됐거나 action != regex_fix → skip
  if (!isLlmFixEnabled() || attempt.action !== "regex_fix") {
    return { attempt, proposal: null, error: null };
  }

  const source = DOMAIN_SOURCES[attempt.domain as keyof typeof DOMAIN_SOURCES];
  if (!source) {
    return {
      attempt,
      proposal: null,
      error: `unknown domain: ${attempt.domain}`,
    };
  }

  try {
    // 1) 사이트 sample fetch
    const sampleHtml = await source.fetcher(source.listUrl);

    // 2) LLM 으로 새 regex 제안
    const proposal = await proposeRegexFix({
      domain: attempt.domain,
      fnName: "parseDetailBody",
      currentRegex: source.currentBodyRegex,
      sampleHtml,
      targetExtract: source.target,
    });
    return { attempt, proposal, error: null };
  } catch (e) {
    return {
      attempt,
      proposal: null,
      error: (e as Error).message,
    };
  }
}

// AutoFixAttempt 배열 처리 — 직렬 (사이트 부담 ↓, LLM cost 제어)
export async function executeAllAutoFixAttempts(
  attempts: AutoFixAttempt[],
): Promise<AutoFixExecutionResult[]> {
  const results: AutoFixExecutionResult[] = [];
  for (const a of attempts) {
    results.push(await executeAutoFixAttempt(a));
  }
  return results;
}

// 텔레그램 메시지 추가용
export function formatAutoFixResults(
  results: AutoFixExecutionResult[],
): string {
  const withProposals = results.filter((r) => r.proposal || r.error);
  if (withProposals.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("🧪 D-4 step 2 (LLM regex 제안):");

  for (const r of withProposals.slice(0, 3)) {
    if (r.error) {
      lines.push(`  ❌ ${r.attempt.domain} ${r.attempt.trigger}`);
      lines.push(`     LLM 실패: ${r.error.slice(0, 200)}`);
    } else if (r.proposal) {
      const icon = r.proposal.sampleMatchTested ? "✅" : "⚠️";
      lines.push(`  ${icon} ${r.attempt.domain} ${r.attempt.trigger}`);
      lines.push(`     제안 regex: ${r.proposal.proposedRegex.slice(0, 80)}`);
      lines.push(`     이유: ${r.proposal.reason.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}
