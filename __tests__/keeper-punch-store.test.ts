import { it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ filters: [] as unknown[][], payload: undefined as any, count: 1 }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  expect(table).toBe('sidecar_state');
  const q: any = {
    insert: async (v: any) => { m.payload = v; return { error: null }; },
    update: (v: any) => { m.payload = v; return q; },
    eq: (...args: any[]) => { m.filters.push(args); return q; },
    select: async () => ({ data: Array.from({ length: m.count }, () => ({ payload: m.payload })), error: null }),
  }; return q;
} }) }));
import { keeperStore } from '../lib/threads/keeper-punch-runtime';
it('adapter isolates bucket and performs one conditional update with nonce and old status', async () => {
  m.filters = [];
  expect(await keeperStore.cas('nonce', 'prepared', { status: 'exchanging' } as any)).toBe(true);
  expect(m.filters).toEqual([['bucket', 'keeper-punch-oauth-v1'], ['payload->>nonce', 'nonce'], ['payload->>status', 'prepared']]);
  m.count = 0; expect(await keeperStore.cas('nonce', 'prepared', {} as any)).toBe(false);
});
it('adapter insert never selects shared legacy bucket', async () => {
  await keeperStore.insert({ nonce: 'nonce' } as any);
  expect(m.payload).toEqual({ bucket: 'keeper-punch-oauth-v1', payload: { nonce: 'nonce' } });
});
