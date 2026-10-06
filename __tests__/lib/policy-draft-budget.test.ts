import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generated: vi.fn(), rows: [] as unknown[] }));
vi.mock('@/lib/policy/ai-guide', () => ({ generatePolicyGuide: mocks.generated }));
vi.mock('@/lib/policy/guidance-storage', () => ({ readPrivateReview: async () => null, savePrivateReview: async () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const query = { select: () => query, order: () => query, limit: () => query, is: () => query,
    in: () => query, abortSignal: () => query,
    then: (resolve: (value: unknown) => unknown) => resolve({ data: mocks.rows, error: null }) };
  return query;
} }) }));
import { backfillPolicyDrafts } from '@/lib/policy/draft-backfill';
it('설명 생성이 지연되면 남은 정책은 다음 처리로 보류한다', async () => {
  const clock = vi.spyOn(Date, 'now'); let now = 0; clock.mockImplementation(() => now);
  mocks.rows = Array.from({ length: 10 }, (_, index) => ({ id: String(index), title: '지원 정책' }));
  mocks.generated.mockImplementation(async () => { now += 20000; return { llmOk: false }; });
  try {
    const result = await backfillPolicyDrafts('welfare_programs', 10);
    expect(mocks.generated).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ failed: 1, deferred: 9 });
  } finally { clock.mockRestore(); }
});
