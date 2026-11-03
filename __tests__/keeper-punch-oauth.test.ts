import { describe, it, expect } from 'vitest';
import { createKeeperHandlers, SCOPES, type KeeperStore } from '../lib/threads/keeper-punch-oauth';
const env = { KEEPER_PUNCH_THREADS_APP_ID: 'app', KEEPER_PUNCH_THREADS_APP_SECRET: 'app-secret', KEEPER_PUNCH_THREADS_USER_ID: '123', KEEPER_PUNCH_OAUTH_CONTROL_SECRET: 'control-secret' };
function fixture(options: { user?: string; id?: string; shortId?: string | number; app?: string; denied?: boolean; failure?: boolean; oversized?: boolean; expired?: boolean; debugUser?: string; type?: string; expectedId?: string; failCall?: number } = {}) {
  const rows = new Map<string, any>(); let clock = 1000000; let calls = 0;
  const store: KeeperStore = {
    async insert(i) { rows.set(i.nonce, structuredClone(i)); },
    async get(n) { return structuredClone(rows.get(n) ?? null); },
    async cas(n, from, value) { if (rows.get(n)?.status !== from) return false; rows.set(n, structuredClone(value)); return true; },
  };
  const expectedId = options.expectedId ?? '123';
  const h = createKeeperHandlers({ env: options.expectedId ? { ...env, KEEPER_PUNCH_THREADS_USER_ID: expectedId } : env, store, now: () => clock, nonce: () => 'a'.repeat(64), fetch: (async (url: any, init: any) => {
    calls++; expect(init.redirect).toBe('error');
    if (calls === options.failCall) throw Error('provider-secret-body-query');
    if (options.failure) return new Response('secret-provider-code', { status: 400 });
    if (options.oversized) return new Response('x'.repeat(40000));
    if (init.body instanceof URLSearchParams && init.body.get('grant_type') === 'client_credentials') {
      expect(String(url)).toBe('https://graph.threads.net/oauth/access_token');
      expect(init.method).toBe('POST');
      return Response.json({ access_token: 'generated-app-token' });
    }
    if (String(url).includes('/oauth/')) return Response.json({ access_token: 'short-secret', user_id: options.shortId ?? '123' });
    if (String(url).includes('/access_token')) return Response.json({ access_token: 'long-secret', expires_in: 3600 });
    if (String(url).includes('/debug_token')) {
      expect(String(url)).toBe('https://graph.threads.net/v1.0/debug_token?input_token=long-secret');
      expect(init.headers.Authorization).toBe('Bearer generated-app-token');
      return Response.json({ data: { ...(options.app ? { app_id: options.app } : {}), type: options.type ?? 'USER', user_id: options.debugUser ?? expectedId, is_valid: true, expires_at: options.expired ? 999 : 2000, scopes: options.denied ? [] : SCOPES } });
    }
    expect(String(url)).toBe('https://graph.threads.net/v1.0/me?fields=id,username');
    expect(['Bearer short-secret', 'Bearer long-secret']).toContain(init.headers.Authorization);
    return Response.json({ id: options.id ?? expectedId, username: options.user ?? 'keeper.punch' });
  }) as typeof fetch });
  const auth = { 'x-keeper-punch-control': 'control-secret' };
  const start = () => h.start(new Request('https://local/start', { method: 'POST', headers: auth }));
  const cb = (state: string, suffix = '&code=code-secret') => h.callback(new Request('https://www.keepioo.com/api/threads/oauth/callback?state=' + encodeURIComponent(state) + suffix));
  const handoff = () => h.handoff(new Request('https://local/handoff', { method: 'POST', headers: auth, body: JSON.stringify({ nonce: 'a'.repeat(64) }) }));
  return { h, rows, start, cb, handoff, advance: (n: number) => { clock += n; }, calls: () => calls };
}
const stateOf = async (f: ReturnType<typeof fixture>) => new URL((await (await f.start()).json()).authorization_url).searchParams.get('state')!;

describe('keeper isolated public handlers', () => {
  it.each(['short_exchange', 'short_identity', 'long_exchange', 'app_token', 'debug', 'long_identity'])('records exact safe failure stage %s without retry', async stage => {
    const stages = ['short_exchange', 'short_identity', 'long_exchange', 'app_token', 'debug', 'long_identity'];
    const f = fixture({ failCall: stages.indexOf(stage) + 1 });
    const state = await stateOf(f);
    expect((await f.cb(state)).status).toBe(400);
    expect(f.rows.get('a'.repeat(64)).failure_stage).toBe(stage);
    const calls = f.calls();
    expect((await f.cb(state)).status).toBe(409); expect(f.calls()).toBe(calls);
    expect(JSON.stringify(f.rows.get('a'.repeat(64)))).not.toContain('provider-secret');
  });
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
    expect(f.calls()).toBe(6);
    expect((await f.cb(s)).status).toBe(409);
    for (let i = 0; i < 2; i++) {
      const r = await f.handoff(); expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toContain('no-store');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await r.json()).access_token).toBe('long-secret');
    }
    expect((await (await f.handoff()).json()).expires_at).toBe(2000000);
    f.advance(1000001); expect((await f.handoff()).status).toBe(410);
  });
  it('uses exact short /me identity despite realistic unsafe numeric exchange metadata', async () => {
    const f = fixture({ shortId: 17841405793187218, expectedId: '17841405793187218' });
    expect((await f.cb(await stateOf(f))).status).toBe(200);
  });
  it.each([{ user: 'other' }, { app: 'other' }, { id: '999' }, { shortId: '999' }, { denied: true }, { failure: true }, { oversized: true }, { expired: true }, { debugUser: '999' }, { type: 'APP' }])('terminal failure with no leak or retry: %j', async options => {
    const f = fixture(options); const s = await stateOf(f); const r = await f.cb(s);
    expect(r.status).toBe(400); expect(await r.text()).toBe('{"error":"oauth_failed"}');
    const row = f.rows.get('a'.repeat(64));
    expect(row.status).toBe('unknown');
    expect(['short_exchange', 'short_identity', 'long_exchange', 'app_token', 'debug', 'long_identity', 'persist']).toContain(row.failure_stage);
    expect(JSON.stringify(row)).not.toMatch(/secret-provider|short-secret|long-secret|code-secret/);
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
