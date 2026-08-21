import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireTier: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ insert: vi.fn() }),
  }),
}));

vi.mock("@/lib/subscription", () => ({
  requireTier: mocks.requireTier,
}));

import { POST } from "@/app/api/alarm/route";

describe("alarm route upgrade funnel", () => {
  it("routes free logged-in users from policy detail alarm CTA to Basic pricing", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u_free", email: "free@example.com" } },
    });
    mocks.requireTier.mockResolvedValue(null);

    const res = await POST(
      new Request("https://www.keepioo.com/api/alarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "free@example.com",
          programId: "policy-1",
          programType: "welfare",
        }),
      }) as Parameters<typeof POST>[0],
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.needsUpgrade).toBe(true);
    expect(body.upgradeUrl).toBe("/pricing?from=policy-detail&recommended=basic");
  });
});
