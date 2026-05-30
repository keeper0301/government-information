// /api/admin/disable-adsense-review-mode — Phase B endpoint 단위 테스트.
// 5 mocking + 8 시나리오 (CSRF / auth / 백필 / Vercel API 성공·실패 / audit 격리).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
  getUser: vi.fn(),
  getNewsRatio: vi.fn(),
  updateProjectEnvByKey: vi.fn(),
  triggerProductionRedeploy: vi.fn(),
  logAdminAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin-auth", () => ({
  isAdminUser: mocks.isAdminUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/analytics/local-press-stats", () => ({
  getNewsRatio: mocks.getNewsRatio,
}));

vi.mock("@/lib/vercel/api", () => ({
  updateProjectEnvByKey: mocks.updateProjectEnvByKey,
  triggerProductionRedeploy: mocks.triggerProductionRedeploy,
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));

import {
  GET,
  POST,
} from "@/app/api/admin/disable-adsense-review-mode/route";

function postReq(opts: { origin?: string; host?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.host) headers.set("host", opts.host);
  return new Request("https://www.keepioo.com/api/admin/disable-adsense-review-mode", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  mocks.isAdminUser.mockReset();
  mocks.getUser.mockReset();
  mocks.getNewsRatio.mockReset();
  mocks.updateProjectEnvByKey.mockReset();
  mocks.triggerProductionRedeploy.mockReset();
  mocks.logAdminAction.mockReset();
});

describe("GET — confirm HTML page", () => {
  it("백필 % 가 HTML 안에 표시", async () => {
    mocks.getNewsRatio.mockResolvedValue({ commentaryBackfillRatio: 0.85 });
    const res = await GET();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("85.0%");
    expect(html).toContain("OFF 확정");
  });
});

describe("POST — security gates", () => {
  it("cross-origin Origin 헤더 → 403 (CSRF)", async () => {
    const res = await POST(
      postReq({ origin: "https://evil.com", host: "www.keepioo.com" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("CSRF");
  });

  it("origin invalid URL → 400", async () => {
    const res = await POST(
      postReq({ origin: "not-a-url", host: "www.keepioo.com" }),
    );
    expect(res.status).toBe(400);
  });

  it("미인증 (isAdminUser false) → 401", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "x@y.com" } } });
    mocks.isAdminUser.mockReturnValue(false);
    const res = await POST(postReq());
    expect(res.status).toBe(401);
  });

  it("백필 < 80% → 400 (안전 차단)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "a@b.com", id: "u1" } } });
    mocks.isAdminUser.mockReturnValue(true);
    mocks.getNewsRatio.mockResolvedValue({ commentaryBackfillRatio: 0.5 });
    const res = await POST(postReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("50.0%");
  });
});

describe("POST — Vercel API 경로", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "a@b.com", id: "u1" } } });
    mocks.isAdminUser.mockReturnValue(true);
    mocks.getNewsRatio.mockResolvedValue({ commentaryBackfillRatio: 0.85 });
  });

  it("정상 → 200 HTML success page (emerald)", async () => {
    mocks.updateProjectEnvByKey.mockResolvedValue(undefined);
    mocks.triggerProductionRedeploy.mockResolvedValue({});
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("✅");
    expect(html).toContain("OFF 완료");
    expect(html).toContain("85.0%");
    expect(mocks.updateProjectEnvByKey).toHaveBeenCalledWith(
      "NEXT_PUBLIC_ADSENSE_REVIEW_MODE",
      "off",
    );
    expect(mocks.triggerProductionRedeploy).toHaveBeenCalled();
  });

  it("env update 실패 → JSON ok=false + redeploy 호출 안 함", async () => {
    mocks.updateProjectEnvByKey.mockRejectedValue(new Error("Vercel API 401"));
    const res = await POST(postReq());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.env_updated).toBe(false);
    expect(body.redeployed).toBe(false);
    expect(body.errors[0]).toContain("env update");
    expect(mocks.triggerProductionRedeploy).not.toHaveBeenCalled();
  });

  it("env 성공 + redeploy 실패 → JSON ok=false + env_updated=true (partial state)", async () => {
    mocks.updateProjectEnvByKey.mockResolvedValue(undefined);
    mocks.triggerProductionRedeploy.mockRejectedValue(new Error("deployment failed"));
    const res = await POST(postReq());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.env_updated).toBe(true);
    expect(body.redeployed).toBe(false);
    expect(body.errors[0]).toContain("redeploy");
  });

  it("logAdminAction 실패해도 state 응답 유지 (try/catch 격리)", async () => {
    mocks.updateProjectEnvByKey.mockResolvedValue(undefined);
    mocks.triggerProductionRedeploy.mockResolvedValue({});
    mocks.logAdminAction.mockRejectedValue(new Error("audit insert 실패"));
    const res = await POST(postReq());
    // audit 실패해도 200 success HTML 유지
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("OFF 완료");
  });
});
