// ============================================================
// 정책 상세 자체 가치 박스용 AI 가이드 생성
// ============================================================
// welfare/loan 정책 메타데이터로 「이용 팁」「자주 묻는 거절 사유」
// 「신청 체크리스트」 3 필드를 OpenAI gpt-4o-mini 로 생성한다.
// 결과는 sanitize 후 DB 컬럼(ai_tips/ai_faq/ai_checklist)에 백필.
// ============================================================

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export type PolicyGuideInput = {
  title: string;
  summary: string | null;
  category: string | null;
  target: string | null;
};

export type PolicyAiGuide = {
  tips: string | null;
  faq: string | null;
  checklist: string | null;
  // LLM 호출+파싱 성공 여부 (sanitize 결과와 무관). 백필 cron 이 "일시 LLM 실패(재시도)"
  // 와 "LLM 성공했으나 메타 부실로 sanitize 전부 실패(영구 부적합)"를 구분하는 데 사용.
  llmOk: boolean;
};

// HTML 제거·공백 정리·한국어 검증·길이 cap. 부적합하면 null.
function sanitize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 10) return null;
  if (!/[가-힣]/.test(cleaned)) return null;
  return cleaned.slice(0, 400);
}

export function buildPolicyGuidePrompt(input: PolicyGuideInput): string {
  return `당신은 한국 정부 지원 정책을 쉽게 안내하는 작가입니다.
아래 정책에 대해 신청자에게 실질적으로 도움이 되는 안내를 작성하세요.

[정책 정보]
- 제목: ${input.title}
- 요약: ${input.summary ?? "(없음)"}
- 분류: ${input.category ?? "(없음)"}
- 대상: ${input.target ?? "(없음)"}

[작성 규칙]
- 원문을 그대로 복사하지 말고 자기 표현으로 풀어쓰세요.
- 각 항목은 1~2문장, 100~200자 한국어로 작성하세요.
- 확실하지 않은 구체 숫자는 지어내지 마세요.

[출력 형식] 아래 JSON 만 출력:
{
  "tips": "이 정책을 활용하면 좋은 경우와 실용 팁",
  "faq": "신청 시 자주 발생하는 거절 사유·주의점",
  "checklist": "신청 전 확인해야 할 항목"
}`;
}

export async function generatePolicyGuide(
  input: PolicyGuideInput,
): Promise<PolicyAiGuide> {
  // LLM 호출 실패·JSON 파싱 실패 등 어떤 오류라도 모두 null 로 안전하게 반환.
  // (실제 parseJSONResponse 는 invalid JSON 이면 throw 하므로 try/catch 필수)
  try {
    const raw = await callLLM({
      prompt: buildPolicyGuidePrompt(input),
      maxTokens: 600,
      jsonMode: true,
    });
    const parsed = parseJSONResponse<{
      tips?: string;
      faq?: string;
      checklist?: string;
    }>(raw);
    return {
      tips: sanitize(parsed?.tips),
      faq: sanitize(parsed?.faq),
      checklist: sanitize(parsed?.checklist),
      llmOk: true,
    };
  } catch {
    return { tips: null, faq: null, checklist: null, llmOk: false };
  }
}
