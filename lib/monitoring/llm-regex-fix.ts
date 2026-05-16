// ============================================================
// Phase D-4 step 2 — LLM 으로 parser regex 자동 생성
// ============================================================
// 사고 감지 (D-1) + auto-fix 활성화 시 (D-4 step 1) → 실제 사이트 HTML 을
// LLM 에 보내 새 regex 추출 → 신규 regex 로 sample 재시도 → 결과 보고.
//
// 실제 파일 변경 X (step 3 에서 git 자동 commit). 이 step 은 LLM 결과
// 평가 + dry-run 보고만.
//
// env D4_AUTO_FIX_LLM_ENABLED=true 일 때만 LLM 호출 (비용 절약).
// ============================================================

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export type RegexProposal = {
  domain: string; // "suncheon" / "gwangju" 등
  fnName: string; // "parseDetailBody" / "parseListPage"
  currentRegex: string; // 현재 코드의 정규식 (참고용)
  proposedRegex: string; // LLM 이 제안한 새 정규식
  sampleMatchTested: boolean; // 신규 regex 로 sample 매칭 성공?
  sampleExtract: string | null; // 매칭 시 추출된 텍스트 일부
  reason: string; // LLM 이 설명한 변경 이유
};

// LLM 호출 활성화 체크 — D-4 step 2 전용 토글
export function isLlmFixEnabled(): boolean {
  const v = process.env.D4_AUTO_FIX_LLM_ENABLED;
  return v === "true" || v === "1";
}

// LLM prompt 생성 — JSON 응답 강제
function buildPrompt(opts: {
  domain: string;
  fnName: string;
  currentRegex: string;
  sampleHtml: string;
  targetExtract: string; // 무엇을 추출하려는지 (예: "보도자료 본문 텍스트")
}): string {
  return `당신은 한국 시·군청 보도자료 HTML 을 파싱하는 정규식 전문가입니다.

[정보]
- 도메인: ${opts.domain}
- 함수: ${opts.fnName}
- 현재 정규식: ${opts.currentRegex}
- 추출 대상: ${opts.targetExtract}

[현재 정규식 실패 의심]
다음 HTML sample 에서 현재 정규식이 매칭 안 되거나 잘못된 부분을 추출합니다.

[Sample HTML]
${opts.sampleHtml.slice(0, 3000)}

[요청]
1) sample HTML 에서 ${opts.targetExtract} 만 정확히 추출하는 새 정규식 작성
2) 변경 이유 한 줄 설명

JSON 형식으로만 응답하세요:
{
  "newRegex": "정규식 문자열 (JavaScript 형식, slash 없이)",
  "reason": "변경 이유"
}`;
}

// LLM 호출 + 결과 검증.
// throw: env 비활성화 / LLM API 실패 / JSON 파싱 실패 / 신규 regex invalid.
// 호출자 try/catch 로 graceful skip.
export async function proposeRegexFix(opts: {
  domain: string;
  fnName: string;
  currentRegex: string;
  sampleHtml: string;
  targetExtract: string;
}): Promise<RegexProposal> {
  if (!isLlmFixEnabled()) {
    throw new Error("D4_AUTO_FIX_LLM_ENABLED 비활성화");
  }

  const prompt = buildPrompt(opts);
  const responseText = await callLLM({
    prompt,
    maxTokens: 500,
    jsonMode: true,
  });

  // LLM 응답 파싱
  let parsed: { newRegex?: unknown; reason?: unknown };
  try {
    parsed = parseJSONResponse(responseText);
  } catch (e) {
    throw new Error(`LLM 응답 JSON 파싱 실패: ${(e as Error).message}`);
  }
  const newRegex = typeof parsed.newRegex === "string" ? parsed.newRegex : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  if (!newRegex) {
    throw new Error("LLM 응답에 newRegex 누락");
  }

  // 신규 regex 컴파일 검증 (invalid 면 throw)
  let re: RegExp;
  try {
    re = new RegExp(newRegex);
  } catch (e) {
    throw new Error(`신규 regex invalid: ${(e as Error).message}`);
  }

  // sample 에 매칭 시도
  const match = re.exec(opts.sampleHtml);
  return {
    domain: opts.domain,
    fnName: opts.fnName,
    currentRegex: opts.currentRegex,
    proposedRegex: newRegex,
    sampleMatchTested: !!match,
    sampleExtract: match ? match[1]?.slice(0, 200) ?? match[0].slice(0, 200) : null,
    reason,
  };
}

// 텔레그램 메시지 추가용
export function formatRegexProposal(proposal: RegexProposal): string {
  const lines: string[] = [];
  const icon = proposal.sampleMatchTested ? "✅" : "❌";
  lines.push(`  ${icon} ${proposal.domain} ${proposal.fnName} 신규 regex:`);
  lines.push(`     현재: ${proposal.currentRegex.slice(0, 80)}`);
  lines.push(`     제안: ${proposal.proposedRegex.slice(0, 80)}`);
  lines.push(`     사유: ${proposal.reason.slice(0, 200)}`);
  if (proposal.sampleMatchTested && proposal.sampleExtract) {
    lines.push(`     추출 sample: ${proposal.sampleExtract.slice(0, 80)}`);
  }
  return lines.join("\n");
}
