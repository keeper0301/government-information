import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ classify: vi.fn(), audit: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/cron-auth', () => ({ authorizeCronRequest: () => null }));
vi.mock('@/lib/admin-actions', () => ({ logAdminAction: m.audit }));
vi.mock('@/lib/news/classify', () => ({ classifyNewsForModeration: m.classify, decideAutoModeration: () => ({ action: 'keep' }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({
  select: () => ({ is: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: 'news' })), error: null }) }) }) }) }),
  update: m.update,
}) }) }));
import { GET } from '@/app/api/cron/news-classify/route';
beforeEach(() => { vi.clearAllMocks(); m.update.mockReturnValue({ eq: async () => ({ error: null }) }); });
it('quota failure stops after the in-flight batch and audits a safe reason', async () => {
  m.classify.mockRejectedValue(new Error('OpenAI API 오류 429: {"error":{"code":"credit_balance_exhausted"}}'));
  const response = await GET(new Request('https://example.test'));
  const result = await response.json();
  expect(result).toMatchObject({ ok: false, fetched: 12, classified: 0, failed: 5, stop_reason: 'credit_exhausted' });
  expect(m.classify).toHaveBeenCalledTimes(5);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ stop_reason: 'credit_exhausted', failed: 5 }) }));
});
it('ordinary per-item errors continue through the bounded batch', async () => {
  m.classify.mockRejectedValue(new Error('JSON 파싱 실패: bad item'));
  const result = await (await GET(new Request('https://example.test'))).json();
  expect(result).toMatchObject({ failed: 12, classified: 0 });
});
it('preserves completed classifications when a later batch fails', async () => {
  let n = 0;
  m.classify.mockImplementation(async () => { if (++n <= 5) return { reason: 'keep' }; throw new Error('OpenAI API 오류 401: {}'); });
  const result = await (await GET(new Request('https://example.test'))).json();
  expect(result).toMatchObject({ kept: 5, classified: 5, failed: 5, stop_reason: 'authentication' });
});
