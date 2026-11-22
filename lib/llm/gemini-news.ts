import type { CallLLMOptions } from './text';

const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// 정책뉴스의 기존 응답 형식과 제한 시간을 재미나이 요청에 전달합니다.
export async function callGeminiNews(options: CallLLMOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY 환경변수 누락');

  const signal = AbortSignal.timeout(options.timeoutMs ?? 20000);
  const config: Record<string, unknown> = {
    maxOutputTokens: options.maxTokens ?? 300,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (options.jsonMode || options.responseSchema) config.responseMimeType = 'application/json';
  if (options.responseSchema) config.responseJsonSchema = options.responseSchema.schema;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: options.prompt }] }], generationConfig: config }),
      signal,
    });
  } catch {
    throw new Error(signal.aborted ? '재미나이 응답 시간 초과' : '재미나이 연결 실패');
  }
  // 원시 오류에는 요청 정보가 있을 수 있어 상태 번호만 전달합니다.
  if (!response.ok) throw new Error('재미나이 API 오류 ' + response.status + ':');
  const data = await response.json().catch(() => {
    throw new Error(signal.aborted ? '재미나이 응답 시간 초과' : '재미나이 응답 형식 오류');
  });
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason !== 'STOP' || !Array.isArray(candidate.content?.parts))
    throw new Error('재미나이 응답에서 완료된 텍스트를 찾지 못했습니다.');
  const text = candidate.content.parts
    .filter((part: { thought?: boolean; text?: string }) => !part?.thought && typeof part?.text === 'string')
    .map((part: { text: string }) => part.text).join('');
  if (!text.trim()) throw new Error('재미나이 응답에서 완료된 텍스트를 찾지 못했습니다.');
  return text;
}
