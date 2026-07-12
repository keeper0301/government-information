import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as trackEvent } from "@/app/api/events/track/route";
import { POST as recommend } from "@/app/api/recommend/route";
import { getRecommendations } from "@/lib/recommend";
import { checkRateLimit } from "@/lib/support/rate-limit";

vi.mock("@/lib/support/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

const adminInsert = vi.fn(async () => ({ error: null }));
const adminRpc = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({ insert: adminInsert })),
    rpc: adminRpc,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/lib/recommend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recommend")>();
  return {
    ...actual,
    getRecommendations: vi.fn(async () => []),
  };
});

vi.mock("@/lib/personalization/load-profile", () => ({
  loadUserProfile: vi.fn(async () => null),
}));

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("distributed public route rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10 });
  });

  it("blocks event tracking through the shared Supabase rate limiter", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 12,
    });

    const res = await trackEvent(
      jsonReq("https://www.keepioo.com/api/events/track", {
        event_type: "program_view",
        program_table: "welfare_programs",
        program_id: "00000000-0000-0000-0000-000000000001",
      }) as never,
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    await expect(res.json()).resolves.toEqual({
      error: "rate_limit",
      retry_after_sec: 12,
    });
    expect(checkRateLimit).toHaveBeenCalledWith({
      bucket: "events:ip:203.0.113.10",
      limit: 60,
    });
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("blocks recommendation requests before recommendation work", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 20,
    });

    const res = await recommend(
      jsonReq("https://www.keepioo.com/api/recommend", {
        ageGroup: "youth",
        region: "서울",
        occupation: "employee",
        programType: "all",
      }) as never,
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("20");
    await expect(res.json()).resolves.toEqual({
      error: "rate_limited",
      retry_after_sec: 20,
    });
    expect(checkRateLimit).toHaveBeenCalledWith({
      bucket: "recommend:ip:203.0.113.10",
      limit: 30,
    });
    expect(getRecommendations).not.toHaveBeenCalled();
  });
});
