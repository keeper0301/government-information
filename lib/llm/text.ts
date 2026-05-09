// ============================================================
// LLM 호출 추상화 (OpenAI gpt-4o-mini default)
// ============================================================
// 6 cron 공통 helper. SDK 미설치, fetch 직접. 미래 provider 교체 1 곳에서.
// 2026-05-10 Anthropic 크레딧 소진 사고 후 OpenAI 전환 일괄 적용.
// ============================================================

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

export type CallLLMOptions = {
  /** user role 메시지 본문. system 분리 안 함 (모든 cron 이 user 1턴 패턴) */
  prompt: string;
  /** 응답 max_tokens. 기본 300 */
  maxTokens?: number;
  /** true 면 response_format json_object 강제 — content 가 보장된 JSON 문자열 */
  jsonMode?: boolean;
  /** model override. 기본 gpt-4o-mini */
  model?: string;
};

/**
 * OpenAI Chat Completion 호출 → text 반환.
 * - apiKey 누락 / API 오류 / 응답 파싱 실패 시 throw (한국어 메시지)
 * - graceful skip 은 호출 측에서 try/catch 로 결정 (각 cron 별 정책 다름)
 */
export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수 누락");
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 300,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API 오류 ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json: unknown = await res.json().catch(() => ({}));
  const text = extractMessageText(json);
  if (!text) throw new Error("OpenAI 응답에서 텍스트 추출 실패");
  return text;
}

// OpenAI Chat Completion 응답: { choices: [{ message: { content: "..." } }] }
function extractMessageText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : null;
}

/**
 * JSON mode 응답을 직접 파싱 — JSON.parse 실패 시 한국어 에러.
 * jsonMode=true 호출 후 사용 권장.
 */
export function parseJSONResponse<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${(e as Error).message}`);
  }
}
