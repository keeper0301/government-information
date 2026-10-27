import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ classify: vi.fn(), save: vi.fn(), confirm: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/admin-actions', () => ({ logAdminAction: m.audit }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { body: '원문' }, error: null }) }) }) }) }) }));
vi.mock('@/lib/press-ingest/filter', () => ({ getPressIngestCandidates: async () => ['a','b','c'].map(id => ({ id, title: id })) }));
vi.mock('@/lib/press-ingest/classify', () => ({ classifyPressNews: m.classify }));
vi.mock('@/lib/press-ingest/candidates', () => ({
  getExistingPressCandidate: async () => null, upsertPressCandidate: m.save,
  buildCandidateUpsert: () => ({ status: 'skipped' }), buildFailedCandidateUpsert: (x: unknown) => x,
  newsSourceUrl: () => '', autoConfirmPendingPressCandidates: m.confirm,
}));
import { runAutoIngest } from '@/lib/press-ingest/ingest';
beforeEach(() => {
  vi.clearAllMocks(); m.save.mockResolvedValue(undefined);
  m.confirm.mockResolvedValue({ confirmed: 0, fallback_filled: 0, layer_breakdown: {}, skipped_no_url: 0, errors: [] });
});
it.each([
  ['OpenAI API 오류 429: {"error":{"code":"credit_balance_exhausted"}}', 'credit_exhausted'],
  ['OpenAI API 오류 401: {}', 'authentication'],
])('stops a shared failure without marking candidates permanently failed: %s', async (message, reason) => {
  m.classify.mockRejectedValue(new Error(message));
  const result = await runAutoIngest();
  expect(result).toMatchObject({ stop_reason: reason, queued_failed: 0, classified: 0 });
  expect(m.classify).toHaveBeenCalledTimes(1);
  expect(m.save).not.toHaveBeenCalled();
  expect(result.errors.join(' ')).not.toContain('OpenAI API 오류');
});
it('keeps per-item parse errors on the existing failed-candidate path', async () => {
  m.classify.mockRejectedValue(new Error('JSON 파싱 실패: invalid'));
  expect(await runAutoIngest()).toMatchObject({ queued_failed: 3, classified: 0 });
});
