import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase admin mock — rate limit 통과 (count 0 fallback)
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          gte: () => Promise.resolve({ count: 0 }),
        }),
      }),
    }),
  }),
}));

import { checkAgentAuth } from "@/lib/agent/auth";

describe("checkAgentAuth (Phase 6 W0)", () => {
  const original = {
    secret: process.env.AGENT_SECRET,
    disabled: process.env.AGENT_DISABLED,
  };

  beforeEach(() => {
    process.env.AGENT_SECRET = "test-secret-64chars";
    delete process.env.AGENT_DISABLED;
  });

  afterEach(() => {
    if (original.secret === undefined) delete process.env.AGENT_SECRET;
    else process.env.AGENT_SECRET = original.secret;
    if (original.disabled === undefined) delete process.env.AGENT_DISABLED;
    else process.env.AGENT_DISABLED = original.disabled;
  });

  it("AGENT_DISABLED=true → 503 kill switch (Secret 무관)", async () => {
    process.env.AGENT_DISABLED = "true";
    const req = new Request("https://x.com", {
      headers: { authorization: "Bearer test-secret-64chars" },
    });
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(503);
    }
  });

  it("AGENT_SECRET 미설정 → 500 (운영 초기 보호)", async () => {
    delete process.env.AGENT_SECRET;
    const req = new Request("https://x.com", {
      headers: { authorization: "Bearer anything" },
    });
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(500);
    }
  });

  it("authorization header 누락 → 401", async () => {
    const req = new Request("https://x.com");
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
    }
  });

  it("authorization header 불일치 → 401", async () => {
    const req = new Request("https://x.com", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
    }
  });

  it("authorization 길이만 같고 내용 다르면 401 (timing-safe)", async () => {
    const req = new Request("https://x.com", {
      headers: { authorization: "Bearer XXXXXXXXXXXXXXXXX" }, // 18자, 실제 secret + Bearer = 26자라 다름
    });
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
    }
  });

  it("정상 Bearer 토큰 + rate limit 통과 → ok", async () => {
    const req = new Request("https://x.com", {
      headers: { authorization: "Bearer test-secret-64chars" },
    });
    const res = await checkAgentAuth(req);
    expect(res.ok).toBe(true);
  });
});
