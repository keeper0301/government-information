import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ classify: vi.fn(), audit: vi.fn(), update: vi.fn(), rows: 12 }));
vi.mock('@/lib/cron-auth', () => ({ authorizeCronRequest: () => null }));
vi.mock('@/lib/admin-actions', () => ({ logAdminAction: m.audit }));
vi.mock('@/lib/news/classify', () => ({ classifyNewsForModeration: m.classify, decideAutoModeration: () => ({ action: 'keep' }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({
  select: () => ({ is: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: Array.from({ length: m.rows }, (_, i) => ({ id: String(i), title: 'news' })), error: null }) }) }) }) }),
  update: m.update,
}) }) }));
import { GET, POST } from '@/app/api/cron/news-classify/route';
beforeEach(() => { vi.clearAllMocks(); m.rows = 12; m.update.mockReturnValue({ eq: async () => ({ error: null }) }); });
it('quota failure stops after the in-flight batch and audits a safe reason', async () => {
  m.classify.mockRejectedValue(new Error('OpenAI API 오류 429: {"error":{"code":"credit_balance_exhausted"}}'));
  const response = await GET(new Request('https://example.test'));
  expect(response.status).toBe(500);
  const result = await response.json();
  expect(result).toMatchObject({ ok: false, fetched: 12, classified: 0, failed: 5, stop_reason: 'credit_exhausted' });
  expect(m.classify).toHaveBeenCalledTimes(5);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ stop_reason: 'credit_exhausted', failed: 5 }) }));
});
it('ordinary per-item errors continue through the bounded batch', async () => {
  m.classify.mockRejectedValue(new Error('JSON 파싱 실패: bad item'));
  const response = await GET(new Request('https://example.test'));
  expect(response.status).toBe(500);
  const result = await response.json();
  expect(result).toMatchObject({ failed: 12, classified: 0 });
});
it('preserves completed classifications when a later batch fails', async () => {
  let n = 0;
  m.classify.mockImplementation(async () => { if (++n <= 5) return { reason: 'keep' }; throw new Error('OpenAI API 오류 401: {}'); });
  const response = await GET(new Request('https://example.test'));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ kept: 5, classified: 5, failed: 5, stop_reason: 'authentication' });
});

it('keeps an empty queue successful without classifying', async () => {
  m.rows = 0;
  const response = await GET(new Request('https://example.test'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, fetched: 0, classified: 0, failed: 0 });
  expect(m.classify).not.toHaveBeenCalled();
});
it('keeps fully successful classifications successful', async () => {
  m.classify.mockResolvedValue({ reason: 'keep' });
  const response = await GET(new Request('https://example.test'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, fetched: 12, classified: 12, kept: 12, failed: 0 });
});
it('reports total persistence failure through POST as HTTP failure', async () => {
  m.classify.mockResolvedValue({ reason: 'keep' });
  m.update.mockReturnValue({ eq: async () => ({ error: { message: 'write failed' } }) });
  const response = await POST(new Request('https://example.test', { method: 'POST' }));
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ ok: false, fetched: 12, classified: 0, failed: 12 });
});
