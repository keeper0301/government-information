import { afterEach, expect, it, vi } from 'vitest';
import { callLLM } from '@/lib/llm/text';
import { newsToolFailure } from '@/lib/news-publication/tool-failure';
import { sharedNewsFailure } from '@/lib/news-publication/queue-status';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('정책뉴스는 재미나이 키로 정해진 응답 형식을 요청한다', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '검사용');
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"pass":true}' }] } }],
  }));
  vi.stubGlobal('fetch', fetchMock);
  const schema = { type: 'object', properties: { pass: { type: 'boolean' } }, required: ['pass'] };
  expect(await callLLM({ provider: 'gemini', prompt: '확인', responseSchema: { name: 'test', schema } }))
    .toBe('{"pass":true}');
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\//);
  expect(JSON.parse(request.body).generationConfig).toMatchObject({
    responseMimeType: 'application/json', responseJsonSchema: schema,
  });
});

it('재미나이 429를 받으면 원시 응답을 노출하지 않고 실행 중단 사유를 남긴다', async () => {
  vi.stubEnv('GEMINI_API_KEY', '검사용');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('비공개 응답', { status: 429 })));
  const error = await callLLM({ provider: 'gemini', prompt: '확인' }).catch(error => error);
  expect(error.message).not.toContain('비공개 응답');
  const toolFailure = newsToolFailure(error).detail;
  expect(toolFailure).toEqual({ kind: 'rate_or_quota', httpStatus: 429 });
  expect(sharedNewsFailure({ toolFailure })).toBe('rate_or_quota');
});