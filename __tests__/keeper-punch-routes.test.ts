import { it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ callback: vi.fn(async () => Response.json({ status: 'isolated' })), start: vi.fn(), handoff: vi.fn(), cookies: vi.fn() }));
vi.mock('@/lib/threads/keeper-punch-runtime', () => ({ keeperHandlers: mocks }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
import { GET } from '../app/api/threads/oauth/callback/route';
import { POST as start } from '../app/api/threads/keeper-punch/oauth/start/route';
import { POST as handoff } from '../app/api/threads/keeper-punch/oauth/handoff/route';
it('dedicated POST routes use isolated handlers', () => {
  expect(start).toBe(mocks.start); expect(handoff).toBe(mocks.handoff);
});
it('shared registered callback branches before legacy cookies/errors', async () => {
  const r = await GET(new Request('https://www.keepioo.com/api/threads/oauth/callback?state=keeper-punch-v1.payload.signature&error=private-error&code=private-code'));
  expect(await r.json()).toEqual({ status: 'isolated' });
  expect(mocks.callback).toHaveBeenCalledTimes(1); expect(mocks.cookies).not.toHaveBeenCalled();
});
it('legacy callback still handles requests without keeper state', async () => {
  const r = await GET(new Request('https://www.keepioo.com/api/threads/oauth/callback'));
  expect(r.status).toBe(400); expect(await r.text()).toContain('인증 코드 또는 상태값이 없습니다');
});
