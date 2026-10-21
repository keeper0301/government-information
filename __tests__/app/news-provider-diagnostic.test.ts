import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/cron/editorial-news-publish/route';
import { callLLM } from '@/lib/llm/text';
import { runNewsPublication } from '@/lib/news-publication/run';
import { saveNewsRun } from '@/lib/news-publication/run-log';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: vi.fn() }));
vi.mock('@/lib/news-publication/run', () => ({ runNewsPublication: vi.fn() }));
vi.mock('@/lib/news-publication/run-log', () => ({ saveNewsRun: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const request = (authorized = true) => new Request('https://example.test/api/cron/editorial-news-publish', {
  method: 'POST', headers: authorized ? { authorization: 'Bearer test-cron-secret' } : {},
  body: '임의 기사 발행 요청은 무시합니다.',
});

it('인증되지 않은 진단은 작성 도구를 호출하지 않는다', async () => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  expect((await POST(request(false))).status).toBe(401);
  expect(callLLM).not.toHaveBeenCalled();
});
it('인증 설정이 없어도 작성 도구를 호출하지 않는다', async () => {
  vi.stubEnv('CRON_SECRET', '');
  expect((await POST(request())).status).toBe(500);
  expect(callLLM).not.toHaveBeenCalled();
});
it('연결 성공은 고정 요청 한 번만 확인하고 발행이나 실행 저장을 하지 않는다', async () => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.mocked(callLLM).mockResolvedValue('확인');
  const response = await POST(request());
  expect(await response.json()).toMatchObject({ connected: true });
  expect(callLLM).toHaveBeenCalledExactlyOnceWith({ prompt: '연결 확인입니다. 확인이라고만 답하세요.', maxTokens: 8, timeoutMs: 15000 });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(runNewsPublication).not.toHaveBeenCalled();
  expect(saveNewsRun).not.toHaveBeenCalled();
});
it('실패 시 비밀값 대신 안전한 원인만 반환하며 기사는 건드리지 않는다', async () => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.mocked(callLLM).mockRejectedValue(new Error('OpenAI API 오류 429: 비밀값포함'));
  const response = await POST(request());
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.toolFailure).toEqual({ kind: 'rate_or_quota', httpStatus: 429 });
  expect(JSON.stringify(body)).not.toContain('비밀값');
  expect(runNewsPublication).not.toHaveBeenCalled();
  expect(saveNewsRun).not.toHaveBeenCalled();
});
