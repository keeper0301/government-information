import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/business-profile/route';
import { requireTier } from '@/lib/subscription';
import { createAdminClient } from '@/lib/supabase/admin';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@example.com' } } }) },
  }),
}));

vi.mock('@/lib/subscription', () => ({
  requireTier: vi.fn(),
}));

const upsertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: upsertMock,
    })),
  })),
}));

function request(body: unknown) {
  return new Request('https://www.keepioo.com/api/business-profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/business-profile paid access gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReturnValue({ single: singleMock });
    upsertMock.mockReturnValue({ select: selectMock });
    singleMock.mockResolvedValue({
      data: {
        user_id: 'user-1',
        industry: 'food',
        revenue_scale: 'under_50m',
        employee_count: '1_4',
        business_type: 'sole_proprietor',
        established_date: '2026-01-01',
        region: '전남광주통합특별시',
        district: '순천시',
      },
      error: null,
    });
  });

  it('blocks free users before service-role upsert', async () => {
    vi.mocked(requireTier).mockResolvedValueOnce(null);

    const res = await PUT(request({ industry: 'food' }) as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ needsUpgrade: true });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('saves basic users using session user id, not client supplied user_id', async () => {
    vi.mocked(requireTier).mockResolvedValueOnce('basic');

    const res = await PUT(request({
      user_id: 'attacker-user',
      industry: 'food',
      revenue_scale: 'under_50m',
      employee_count: '1_4',
      business_type: 'sole_proprietor',
      established_date: '2026-01-01',
      region: '전남광주통합특별시',
      district: '순천시',
    }) as never);

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        industry: 'food',
        revenue_scale: 'under_50m',
      }),
      { onConflict: 'user_id', ignoreDuplicates: false },
    );
  });

  it('normalizes invalid enum/date values to null before saving', async () => {
    vi.mocked(requireTier).mockResolvedValueOnce('pro');

    const res = await PUT(request({
      industry: 'invalid',
      revenue_scale: 'invalid',
      employee_count: 'invalid',
      business_type: 'invalid',
      established_date: '01-01-2026',
      region: '  ',
      district: 'x'.repeat(80),
    }) as never);

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        industry: null,
        revenue_scale: null,
        employee_count: null,
        business_type: null,
        established_date: null,
        region: null,
        district: 'x'.repeat(30),
      }),
      expect.anything(),
    );
  });
});
