import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let rows = table === 'press_ingest_candidates' ? [...state.rows] : [];
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return q; },
    is: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return q; },
    gte: (k: string, v: string) => { rows = rows.filter(r => typeof r[k] === 'string' && String(r[k]) >= v); return q; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve),
  }; return q;
} }) }));
import { getPressAutoConfirmStats } from '@/lib/press-ingest/filter';
import { getPressIngestTierStats } from '@/lib/analytics/press-ingest-tier-stats';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T00:15:31Z'));
  state.rows = [
    { status: 'confirmed', confidence_tier: 'low', created_at: '2026-10-01', confirmed_at: '2026-10-26', confirmed_by: 'admin', classified_payload: {} },
    { status: 'rejected', confidence_tier: 'low', created_at: '2026-10-07', rejected_at: '2026-10-26', rejected_by: null },
    { status: 'confirmed', confidence_tier: 'low', created_at: '2026-10-01', confirmed_at: '2026-10-19', confirmed_by: 'admin', classified_payload: {} },
  ];
});
afterEach(() => vi.useRealTimers());
it('health statistics count decisions made this week on older candidates', async () => {
  expect(await getPressAutoConfirmStats()).toMatchObject({ low_confirmed_7d: 1, low_rejected_7d: 1, low_confirm_rate_7d: 50 });
});
it('tier dashboard uses the same decision window', async () => {
  expect(await getPressIngestTierStats()).toMatchObject({ lowConfirmed7d: 1, lowRejected7d: 1, lowConfirmRate7d: 50 });
});
it('automatic cleanup is a decision count, not evidence of classifier quality', async () => {
  state.rows = Array.from({ length: 9 }, () => ({ status: 'rejected', confidence_tier: 'low', created_at: '2026-10-07', rejected_at: '2026-10-26', rejected_by: null }));
  expect((await getPressAutoConfirmStats()).low_confirm_rate_hint).toBe('자동 결정 포함 — 사람 검수 표본 별도 확인');
  expect((await getPressIngestTierStats()).lowConfirmRateHint).toBe('자동 결정 포함 — 사람 검수 표본 별도 확인');
});
