import { describe, it, expect } from 'vitest';
import { createKeeperHandlers, SCOPES, type KeeperStore } from '../lib/threads/keeper-punch-oauth';
const env = { KEEPER_PUNCH_THREADS_APP_ID: 'app', KEEPER_PUNCH_THREADS_APP_SECRET: 'app-secret', KEEPER_PUNCH_THREADS_USER_ID: '123', KEEPER_PUNCH_OAUTH_CONTROL_SECRET: 'control-secret' };
function fixture(options: { user?: string; id?: string; shortId?: string; app?: string; denied?: boolean; failure?: boolean; oversized?: boolean } = {}) {
  const rows = new Map<string, any>(); let clock = 1000000; let calls = 0;
  const store: KeeperStore = {
    async insert(i) { rows.set(i.nonce, structuredClone(i)); },
    async get(n) { return structuredClone(rows.get(n) ?? null); },
    async cas(n, from, value) { if (rows.get(n)?.status !== from) return false; rows.set(n, structuredClone(value)); return true; },
  };
  const h = createKeeperHandlers({ env, store, now: () => clock, nonce: () => 'a'.repeat(64), fetch: (async (url: any, init: any) => {
    calls++; expect(init.redirect).toBe('error');
    if (options.failure) return new Response('secret-provider-code', { status: 400 });
    if (options.oversized) return new Response('x'.repeat(40000));
    if (String(url).includes('/oauth/')) return Response.json({ access_token: 'short-secret', user_id: options.shortId ?? '123' });
    if (String(url).includes('/access_token')) return Response.json({ access_token: 'long-secret', expires_in: 3600 });
    if (String(url).includes('/debug_token')) return Response.json({ data: { app_id: options.app ?? 'app', user_id: '123', is_valid: true } });
    expect(init.headers.Authorization).toBe('Bearer long-secret');
    if (String(url).includes('/permissions')) return Response.json({ data: SCOPES.map(permission => ({ permission, status: options.denied ? 'declined' : 'granted' })) });
    return Response.json({ id: options.id ?? '123', username: options.user ?? 'keeper.punch' });
  }) as typeof fetch });
  const auth = { 'x-keeper-punch-control': 'control-secret' };
  const start = () => h.start(new Request('https://local/start', { method: 'POST', headers: auth }));
  const cb = (state: string, suffix = '&code=code-secret') => h.callback(new Request('https://www.keepioo.com/api/threads/oauth/callback?state=' + encodeURIComponent(state) + suffix));
  const handoff = () => h.handoff(new Request('https://local/handoff', { method: 'POST', headers: auth, body: JSON.stringify({ nonce: 'a'.repeat(64) }) }));
  return { h, rows, start, cb, handoff, advance: (n: number) => { clock += n; }, calls: () => calls };
}
const stateOf = async (f: ReturnType<typeof fixture>) => new URL((await (await f.start()).json()).authorization_url).searchParams.get('state')!;

describe('keeper isolated public handlers', () => {
  it('encrypts complete credential; tampering, AAD/nonce and key changes fail closed', async () => {
    const f = fixture(); const s = await stateOf(f); expect((await f.cb(s)).status).toBe(200);
    const row = f.rows.get('a'.repeat(64));
    expect(JSON.stringify(row)).not.toContain('long-secret');
    expect(row.credential).toBeUndefined(); expect(row.envelope.ciphertext).toBeTruthy();
    for (const field of ['ciphertext', 'tag', 'iv']) {
      const old = row.envelope[field]; row.envelope[field] = 'AAAA';
      expect((await f.handoff()).status).toBe(400); row.envelope[field] = old;
    }
    row.nonce = 'b'.repeat(64); expect((await f.handoff()).status).toBe(400); row.nonce = 'a'.repeat(64);
    const old = env.KEEPER_PUNCH_OAUTH_CONTROL_SECRET; env.KEEPER_PUNCH_OAUTH_CONTROL_SECRET = 'new-key';
    try {
      const r = await f.h.handoff(new Request('https://local', { method: 'POST', headers: { 'x-keeper-punch-control': 'new-key' }, body: JSON.stringify({ nonce: 'a'.repeat(64) }) }));
      expect(r.status).toBe(400);
    } finally { env.KEEPER_PUNCH_OAUTH_CONTROL_SECRET = old; }
  });
  it('one exchange wins concurrent callbacks; private handoff is safely repeatable', async () => {
    const f = fixture(); const s = await stateOf(f);
    const results = await Promise.all([f.cb(s), f.cb(s)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(f.calls()).toBe(5);
    expect((await f.cb(s)).status).toBe(409);
    for (let i = 0; i < 2; i++) {
      const r = await f.handoff(); expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toContain('no-store');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await r.json()).access_token).toBe('long-secret');
    }
    f.advance(3600001); expect((await f.handoff()).status).toBe(410);
  });
  it.each([{ user: 'other' }, { app: 'other' }, { id: '999' }, { shortId: '999' }, { denied: true }, { failure: true }, { oversized: true }])('terminal failure with no leak or retry: %j', async options => {
    const f = fixture(options); const s = await stateOf(f); const r = await f.cb(s);
    expect(r.status).toBe(400); expect(await r.text()).toBe('{"error":"oauth_failed"}');
    const count = f.calls(); expect((await f.cb(s)).status).toBe(409); expect(f.calls()).toBe(count);
    expect((await f.handoff()).status).toBe(409);
  });
  it('provider denial is terminal without any exchange', async () => {
    const f = fixture(); const s = await stateOf(f);
    expect((await f.cb(s, '&error=token-secret')).status).toBe(400);
    expect((await f.cb(s)).status).toBe(409); expect(f.calls()).toBe(0);
  });
  it('rejects expiry, tampering and changed app binding before provider calls', async () => {
    const f = fixture(); const s = await stateOf(f);
    expect((await f.cb(s + 'x')).status).toBe(400);
    const old = env.KEEPER_PUNCH_THREADS_APP_ID; env.KEEPER_PUNCH_THREADS_APP_ID = 'different';
    try { expect((await f.cb(s)).status).toBe(400); } finally { env.KEEPER_PUNCH_THREADS_APP_ID = old; }
    f.advance(600000); expect((await f.cb(s)).status).toBe(400); expect(f.calls()).toBe(0);
  });
  it('missing or wrong control auth is 401 for both private endpoints', async () => {
    const f = fixture();
    for (const handler of [f.h.start, f.h.handoff]) {
      expect((await handler(new Request('https://local', { method: 'POST', body: 'not json' }))).status).toBe(401);
    }
  });
  it.each([{}, { ...env, KEEPER_PUNCH_OAUTH_CONTROL_SECRET: '   ' }])('fails closed before request body when configuration is blank: %j', async blank => {
    const h = createKeeperHandlers({ env: blank, store: {} as any });
    for (const handler of [h.start, h.handoff, h.callback]) {
      const r = await handler(new Request('https://local/start', { method: 'POST', body: 'secret' }));
      expect(r.status).toBe(503); expect(await r.text()).not.toContain('secret');
    }
  });
});
