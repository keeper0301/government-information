import { describe, it, expect, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRequestError: vi.fn() }));
import * as Sentry from '@sentry/nextjs';
import { register } from '../../instrumentation';
import { shouldDropOAuthTelemetry } from '../../lib/security/oauth-telemetry';
describe('OAuth telemetry secret boundary', () => {
  it.each([
    { request: { url: 'https://www.keepioo.com/api/threads/oauth/callback?code=fixture-private-code' } },
    { transaction: 'POST /api/threads/keeper-punch/oauth/handoff' },
    { spans: [{ data: { 'url.full': 'https://graph.threads.net/access_token?client_secret=fixture-private' } }] },
    { spans: [{ description: 'GET https://graph.threads.net/debug_token?input_token=fixture-private' }] },
    { contexts: { trace: { url: 'https://graph.threads.com/oauth/access_token' } } },
    { request: { headers: { 'X-Keeper-Punch-Control': 'fixture-private' } } },
    { breadcrumbs: [{ data: { url: 'https://threads.com/oauth/authorize?state=fixture-private' } }] },
  ])('drops entire sensitive auth telemetry instead of retaining unknown fields', (event) => {
    expect(shouldDropOAuthTelemetry(event)).toBe(true);
  });
  it.each(['nodejs', 'edge'])('registers privacy guards in the real %s SDK initialization', async (runtime) => {
    vi.stubEnv('NEXT_RUNTIME', runtime);
    vi.mocked(Sentry.init).mockClear();
    try {
      await register();
      expect(Sentry.init).toHaveBeenCalledOnce();
      const options = vi.mocked(Sentry.init).mock.calls[0][0] as unknown as {
        beforeSend: (event: unknown) => unknown;
        beforeSendTransaction: (event: unknown) => unknown;
      };
      const sensitive = { request: { url: 'https://www.keepioo.com/api/threads/oauth/callback?code=fixture-private' } };
      const publicEvent = { request: { url: 'https://www.keepioo.com/guides' } };
      expect(options.beforeSend(sensitive)).toBeNull();
      expect(options.beforeSendTransaction(sensitive)).toBeNull();
      expect(options.beforeSend(publicEvent)).toBe(publicEvent);
    } finally { vi.unstubAllEnvs(); }
  });
  it('retains unrelated public-site errors and performance data', () => {
    expect(shouldDropOAuthTelemetry({ request: { url: 'https://www.keepioo.com/guides' }, transaction: 'GET /guides' })).toBe(false);
  });
  it('handles cycles and fails closed on oversized telemetry', () => {
    const cyclic: any = { transaction: 'GET /guides' }; cyclic.self=cyclic;
    expect(shouldDropOAuthTelemetry(cyclic)).toBe(false);
    expect(shouldDropOAuthTelemetry(Array.from({length:10001},()=>({safe:true})))).toBe(true);
  });
});
