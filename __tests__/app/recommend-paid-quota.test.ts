import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getRecommendations: vi.fn(),
  loadUserProfile: vi.fn(),
  checkAndConsumeRecommendQuota: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/support/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/personalization/load-profile", () => ({
  loadUserProfile: mocks.loadUserProfile,
}));

vi.mock("@/lib/quota", () => ({
  checkAndConsumeRecommendQuota: mocks.checkAndConsumeRecommendQuota,
}));

vi.mock("@/lib/recommend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recommend")>();
  return {
    ...actual,
    getRecommendations: mocks.getRecommendations,
  };
});

import { POST } from "@/app/api/recommend/route";

function jsonReq(body: unknown) {
  return new Request("https://www.keepioo.com/api/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/recommend paid quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    });
    mocks.loadUserProfile.mockResolvedValue(null);
    mocks.getRecommendations.mockResolvedValue([]);
    mocks.checkAndConsumeRecommendQuota.mockResolvedValue({
      ok: true,
      remaining: 4,
      tier: "free",
    });
  });

  it("free user over daily recommend quota gets upgrade response before recommendation work", async () => {
    mocks.checkAndConsumeRecommendQuota.mockResolvedValueOnce({
      ok: false,
      reason: "over_limit",
      tier: "free",
      limit: 5,
    });

    const res = await POST(
      jsonReq({
        ageGroup: "20대",
        region: "서울",
        occupation: "직장인",
        programType: "all",
      }) as never,
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      needsUpgrade: true,
      quota: { exceeded: true, limit: 5, tier: "free" },
    });
    expect(mocks.checkAndConsumeRecommendQuota).toHaveBeenCalledWith("user-1");
    expect(mocks.getRecommendations).not.toHaveBeenCalled();
  });

  it("continues recommendation work when quota allows", async () => {
    const res = await POST(
      jsonReq({
        ageGroup: "20대",
        region: "서울",
        occupation: "직장인",
        programType: "all",
      }) as never,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ programs: [] });
    expect(mocks.getRecommendations).toHaveBeenCalledOnce();
  });
});
