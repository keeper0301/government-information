import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const BUCKET = 'keeper-punch-oauth-v1';
export const CALLBACK = 'https://www.keepioo.com/api/threads/oauth/callback';
export const SCOPES = ['threads_basic', 'threads_content_publish', 'threads_read_replies', 'threads_manage_replies'];
const PREFIX = 'keeper-punch-v1';
type Env = Record<string, string | undefined>;
type Envelope = { iv: string; tag: string; ciphertext: string };
type FailureStage = 'short_exchange' | 'short_identity' | 'long_exchange' | 'app_token' | 'debug' | 'long_identity' | 'persist';
type Intent = { nonce: string; app_id: string; user_id: string; username: string; callback: string; issued: number; status: string; envelope?: Envelope; expires_at?: number; failure_stage?: FailureStage };
type Credential = { access_token: string; app_id: string; user_id: string; username: string; scopes: string[]; expires_at: number };
export interface KeeperStore {
  insert(value: Intent): Promise<void>;
  get(nonce: string): Promise<Intent | null>;
  cas(nonce: string, from: string, value: Intent): Promise<boolean>;
}
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'content-type': 'application/json', 'x-content-type-options': 'nosniff' };
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function config(env: Env) {
  const names = ['KEEPER_PUNCH_THREADS_APP_ID', 'KEEPER_PUNCH_THREADS_APP_SECRET', 'KEEPER_PUNCH_THREADS_USER_ID', 'KEEPER_PUNCH_OAUTH_CONTROL_SECRET'];
  const v = names.map(n => env[n]);
  if (v.some(x => !x || x !== x.trim())) return null;
  return { app: v[0]!, secret: v[1]!, user: v[2]!, control: v[3]! };
}
async function limitedJson(response: Response, cap = 32768): Promise<any> {
  if (!response.ok || response.redirected || !response.body) throw Error('provider_failed');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > cap) throw Error('body_limit'); chunks.push(value); } }
  finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createKeeperHandlers(deps: { env: Env; store: KeeperStore; fetch?: typeof fetch; now?: () => number; nonce?: () => string }) {
  const now = deps.now ?? Date.now, transport = deps.fetch ?? fetch;
  const cfg = () => config(deps.env);
  const authorized = (r: Request, c: NonNullable<ReturnType<typeof cfg>>) => equal(r.headers.get('x-keeper-punch-control') ?? '', c.control);
  const provider = async (path: string, init: RequestInit) => limitedJson(await transport(`https://graph.threads.net${path}`, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) }));
  const binding = (i: Intent, c: NonNullable<ReturnType<typeof cfg>>) => i.app_id === c.app && i.user_id === c.user && i.username === 'keeper.punch' && i.callback === CALLBACK;
  const key = (secret: string) => createHash('sha256').update('keeper-punch-oauth-v1/credential/aes-256-gcm\0').update(secret).digest();
  const aad = (i: Intent) => Buffer.from(JSON.stringify([BUCKET, i.app_id, i.user_id, i.username, i.callback, i.nonce]));
  const seal = (credential: Credential, i: Intent, secret: string): Envelope => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
    cipher.setAAD(aad(i));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  };
  const open = (i: Intent, secret: string): Credential => {
    if (!i.envelope) throw Error();
    const e = i.envelope, decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(e.iv, 'base64'));
    decipher.setAAD(aad(i)); decipher.setAuthTag(Buffer.from(e.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  };
  return {
    async start(request: Request) {
      const c = cfg(); if (!c) return reply(503, { error: 'unconfigured' });
      if (!authorized(request, c)) return reply(401, { error: 'unauthorized' });
      try {
        const i: Intent = { nonce: deps.nonce?.() ?? randomBytes(32).toString('hex'), app_id: c.app, user_id: c.user, username: 'keeper.punch', callback: CALLBACK, issued: now(), status: 'prepared' };
        const payload = Buffer.from(JSON.stringify(i)).toString('base64url');
        const base = `${PREFIX}.${payload}`;
        const state = `${base}.${createHmac('sha256', c.control).update(base).digest('hex')}`;
        await deps.store.insert(i);
        const params = new URLSearchParams({ client_id: c.app, redirect_uri: CALLBACK, scope: SCOPES.join(','), response_type: 'code', state });
        return reply(200, { nonce: i.nonce, app_id: c.app, user_id: c.user, username: i.username, callback: CALLBACK, expires_at: i.issued + 600000, authorization_url: `https://threads.net/oauth/authorize?${params}` });
      } catch { return reply(500, { error: 'start_failed' }); }
    },
    async callback(request: Request) {
      const c = cfg(); if (!c) return reply(503, { error: 'unconfigured' });
      let intent: Intent | null = null;
      let stage: FailureStage = 'short_exchange';
      try {
        const u = new URL(request.url); const state = u.searchParams.get('state') ?? '';
        if (state.length > 4096) throw Error();
        const [prefix, payload, signature, extra] = state.split('.');
        const base = `${prefix}.${payload}`;
        if (extra || prefix !== PREFIX || !signature || !equal(signature, createHmac('sha256', c.control).update(base).digest('hex'))) throw Error();
        const signed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Intent;
        if (!binding(signed, c) || !Number.isFinite(signed.issued) || now() < signed.issued || now() >= signed.issued + 600000) throw Error();
        intent = await deps.store.get(signed.nonce);
        if (!intent || !binding(intent, c) || intent.issued !== signed.issued || intent.status !== 'prepared') return reply(409, { error: 'not_prepared' });
        if (!await deps.store.cas(intent.nonce, 'prepared', { ...intent, status: 'exchanging' })) return reply(409, { error: 'not_prepared' });
        intent = { ...intent, status: 'exchanging' };
        const code = u.searchParams.get('code');
        if (u.searchParams.has('error') || !code || code.length > 4096) throw Error();
        const short = await provider('/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.app, client_secret: c.secret, grant_type: 'authorization_code', redirect_uri: CALLBACK, code }) });
        if (typeof short.access_token !== 'string' || !short.access_token) throw Error();
        stage = 'short_identity';
        // Unsafe JSON numbers cannot prove identity. The exact string /me ID is authoritative.
        if (typeof short.user_id === 'string') { if (short.user_id !== c.user) throw Error(); }
        else if (typeof short.user_id !== 'number' || !Number.isInteger(short.user_id) || short.user_id <= 0 ||
          (Number.isSafeInteger(short.user_id) && String(short.user_id) !== c.user)) throw Error();
        const shortMe = await provider('/v1.0/me?fields=id,username', { headers: { Authorization: `Bearer ${short.access_token}` } });
        if (shortMe.id !== c.user || shortMe.username !== 'keeper.punch') throw Error();
        stage = 'long_exchange';
        // Threads long-token endpoint requires these query parameters; never log URLs.
        const params = new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: c.secret, access_token: short.access_token });
        const longIssuedAt = now();
        const long = await provider(`/access_token?${params}`, { method: 'GET' });
        if (typeof long.access_token !== 'string' || !long.access_token || !Number.isSafeInteger(long.expires_in) || long.expires_in <= 0) throw Error();
        const auth = { Authorization: `Bearer ${long.access_token}` };
        stage = 'app_token';
        const appToken = await provider('/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.app, client_secret: c.secret, grant_type: 'client_credentials' }) });
        if (typeof appToken.access_token !== 'string' || !appToken.access_token) throw Error();
        stage = 'debug';
        const debug = await provider(`/v1.0/debug_token?${new URLSearchParams({ input_token: long.access_token })}`, { headers: { Authorization: `Bearer ${appToken.access_token}` } });
        const d = debug.data;
        if (!d || (Object.prototype.hasOwnProperty.call(d, 'app_id') && d.app_id !== c.app) || d.user_id !== c.user || d.is_valid !== true || d.type !== 'USER' ||
          typeof d.expires_at !== 'number' || !Number.isFinite(d.expires_at) || !Number.isFinite(d.expires_at * 1000) || d.expires_at * 1000 <= now() ||
          !Array.isArray(d.scopes) || !SCOPES.every(s => d.scopes.includes(s))) throw Error();
        stage = 'long_identity';
        const me = await provider('/v1.0/me?fields=id,username', { headers: auth });
        if (me.id !== c.user || me.username !== 'keeper.punch') throw Error();
        stage = 'persist';
        const credential: Credential = { access_token: long.access_token, app_id: c.app, user_id: c.user, username: 'keeper.punch', scopes: SCOPES, expires_at: Math.min(d.expires_at * 1000, longIssuedAt + long.expires_in * 1000) };
        if (credential.expires_at <= now()) throw Error();
        if (!await deps.store.cas(intent.nonce, 'exchanging', { ...intent, status: 'verified', envelope: seal(credential, intent, c.control), expires_at: credential.expires_at })) throw Error();
        return reply(200, { status: 'verified' });
      } catch {
        if (intent?.status === 'exchanging') { try { await deps.store.cas(intent.nonce, 'exchanging', { ...intent, status: 'unknown', failure_stage: stage }); } catch { /* exchanging remains terminal, never re-exchange */ } }
        return reply(400, { error: 'oauth_failed' });
      }
    },
    async handoff(request: Request) {
      const c = cfg(); if (!c) return reply(503, { error: 'unconfigured' });
      if (!authorized(request, c)) return reply(401, { error: 'unauthorized' });
      try {
        const input = await limitedJson(new Response(request.body), 1024);
        if (typeof input.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(input.nonce)) return reply(400, { error: 'invalid_nonce' });
        const i = await deps.store.get(input.nonce);
        if (!i || !binding(i, c)) return reply(404, { error: 'not_found' });
        if (i.status !== 'verified') return reply(409, { status: i.status });
        const credential = open(i, c.control);
        if (i.nonce !== input.nonce || credential.app_id !== c.app || credential.user_id !== c.user || credential.username !== 'keeper.punch' || !SCOPES.every(s => credential.scopes.includes(s)) || !Number.isFinite(credential.expires_at) || credential.expires_at !== i.expires_at) throw Error();
        if (credential.expires_at <= now()) return reply(410, { error: 'expired' });
        return reply(200, { nonce: i.nonce, ...credential });
      } catch { return reply(400, { error: 'handoff_failed' }); }
    },
  };
}
