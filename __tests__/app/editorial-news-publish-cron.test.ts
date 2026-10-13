import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ authorize: vi.fn(), run: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/cron-auth', () => ({ authorizeCronRequest: mock.authorize }));
vi.mock('@/lib/news-publication/run', () => ({ runNewsPublication: mock.run }));
vi.mock('next/cache', () => ({ revalidatePath: mock.invalidate }));
import { GET } from '@/app/api/cron/editorial-news-publish/route';
beforeEach(() => { vi.clearAllMocks(); mock.authorize.mockReturnValue(null); });
it('로그인하지 않은 외부 요청은 예약 작업을 실행하지 못한다', async () => {
  mock.authorize.mockReturnValue(new Response(null, { status: 401 }));
  expect((await GET(new Request('https://www.keepioo.com'))).status).toBe(401);
  expect(mock.run).not.toHaveBeenCalled();
});
it('공개한 상세와 목록만 갱신하고 비공개 원문을 반환하지 않는다', async () => {
  mock.run.mockResolvedValue({ published: 1, slugs: ['policy-brief-148972915'] });
  expect(await (await GET(new Request('https://www.keepioo.com'))).json()).toEqual({ published: 1, slugs: ['policy-brief-148972915'] });
  expect(mock.invalidate).toHaveBeenCalledWith('/news/policy-brief-148972915');
});
it('작업 실패를 성공으로 응답하지 않는다', async () => {
  mock.run.mockRejectedValue(new Error('비공개 오류 정보'));
  const response = await GET(new Request('https://www.keepioo.com'));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('비공개 오류 정보');
});
