// ============================================================
// news 상세 자체 해설 박스용 AI commentary 생성 (P2 Step 3)
// ============================================================
// news_posts 메타·본문으로 "이 뉴스가 시민에게 의미하는 것 + 행동 동선"
// 한 단락을 OpenAI gpt-4o-mini 로 생성. 결과는 sanitize 후 ai_commentary 컬럼 백필.
// 단순 요약 X (외부 보도자료 단순 복제 = scaled content) → keepioo 자체 해석.
// ============================================================

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export type NewsCommentaryInput = {
  title: string;
  summary: string | null;
  body: string;
  category: string | null;
  keywords: string[] | null;
};

export type NewsAiCommentary = {
  commentary: string | null;
  // LLM 호출+파싱 성공 여부. 일시 실패(재시도)와 영구 부적합(sanitize 실패) 구분.
  llmOk: boolean;
};

// HTML 제거·공백 정리·한국어 검증·길이 cap. 부적합하면 null.
function sanitize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 100) return null; // 한 단락 최소
  if (!/[가-힣]/.test(cleaned)) return null;
  return cleaned.slice(0, 600); // 한 단락 cap
}

export function buildNewsCommentaryPrompt(input: NewsCommentaryInput): string {
  return `당신은 한국 정부 정책·보도자료를 시민에게 쉽게 풀어주는 작가입니다.
아래 보도자료를 단순 요약하지 말고, "시민에게 의미하는 것" + "어떤 행동을 하면 좋은가" 두 측면으로 한 단락 작성.

[원본 정보]
- 제목: ${input.title}
- 요약: ${input.summary ?? "(없음)"}
- 분류: ${input.category ?? "(없음)"}
- 키워드: ${(input.keywords || []).join(", ") || "(없음)"}
- 본문(앞부분): ${input.body.slice(0, 1500)}

[작성 규칙]
- 원본 표현을 그대로 복사 금지. 자기 표현으로 풀어쓰세요.
- 단순 요약 금지. "이 정책이 누구에게 무엇을 의미하는가" + "신청·확인할 행동" 두 흐름.
- 200~400자 한국어 한 단락.
- 확실하지 않은 구체 숫자는 지어내지 마세요.

[출력 형식] 아래 JSON 만 출력:
{
  "commentary": "시민 관점 의미 + 행동 동선 한 단락"
}`;
}

export async function generateNewsCommentary(
  input: NewsCommentaryInput,
): Promise<NewsAiCommentary> {
  try {
    const raw = await callLLM({
      prompt: buildNewsCommentaryPrompt(input),
      maxTokens: 500,
      jsonMode: true,
    });
    const parsed = parseJSONResponse<{ commentary?: string }>(raw);
    return {
      commentary: sanitize(parsed?.commentary),
      llmOk: true,
    };
  } catch (e) {
    console.warn("[ai-commentary] LLM 실패:", (e as Error).message);
    return { commentary: null, llmOk: false };
  }
}
