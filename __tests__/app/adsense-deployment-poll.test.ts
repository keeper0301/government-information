// /api/cron/adsense-deployment-poll — Critical #2 polling fallback 회귀 안전망.
// 8 시나리오: helper mock + 분기 query (triggers vs resolved) 로 dedup 검증.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  triggers: [] as Array<{ id: string; details: { deployment_id?: string }; created_at: string }>,
  resolved: [] as Array<{ details: { deployment_id?: string } }>,
  getDeploymentById: vi.fn(),
  notifyAdsenseDeploymentResult: vi.fn(async () => undefined),
  authorizeCronRequest: vi.fn(() => null),
}));

// 호출 순서로 분기: 1번째 from() = triggers, 2번째 = resolved.
let queryStep = 0;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const step = queryStep++;
      return {
        select: () => ({
          eq: () => ({
            gte: () => {
              if (step === 0) {
                // triggers query: .order().limit() chain
                return {
                  order: () => ({
                    limit: async () => ({ data: mocks.triggers }),
                  }),
                };
              }
              // resolved query: 직접 await (gte → Promise)
              return Promise.resolve({ data: mocks.resolved });
            },
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/vercel/api", () => ({
  getDeploymentById: mocks.getDeploymentById,
}));
vi.mock("@/lib/adsense/deployment-message", () => ({
  notifyAdsenseDeploymentResult: mocks.notifyAdsenseDeploymentResult,
}));
vi.mock("@/lib/cron-auth", () => ({
  authorizeCronRequest: mocks.authorizeCronRequest,
}));

import { GET } from "@/app/api/cron/adsense-deployment-poll/route";

function cronReq(): Request {
  return new Request("https://www.keepioo.com/api/cron/adsense-deployment-poll");
}

beforeEach(() => {
  mocks.triggers.length = 0;
  mocks.resolved.length = 0;
  mocks.getDeploymentById.mockReset();
  mocks.notifyAdsenseDeploymentResult.mockReset();
  mocks.authorizeCronRequest.mockReturnValue(null);
  process.env.VERCEL_TOKEN = "test-token";
  queryStep = 0;
});

describe("adsense-deployment-poll", () => {
  it("VERCEL_TOKEN 미설정 → skipped", async () => {
    delete process.env.VERCEL_TOKEN;
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.skipped).toContain("VERCEL_TOKEN");
    expect(mocks.getDeploymentById).not.toHaveBeenCalled();
  });

  it("최근 30분 audit 없음 → checked=0", async () => {
    mocks.triggers.length = 0;
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBe(0);
  });

  it("audit 있지만 deployment_id 없음 → skip", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: {},
    });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(mocks.getDeploymentById).not.toHaveBeenCalled();
  });

  it("이미 resolved 된 deployment → skip (dedup 검증)", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: { deployment_id: "dpl_done" },
    });
    mocks.resolved.push({ details: { deployment_id: "dpl_done" } });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(mocks.getDeploymentById).not.toHaveBeenCalled();
    expect(mocks.notifyAdsenseDeploymentResult).not.toHaveBeenCalled();
  });

  it("state BUILDING → 다음 회차 재시도 (텔레그램 X)", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: { deployment_id: "dpl_b" },
    });
    mocks.getDeploymentById.mockResolvedValue({ id: "dpl_b", state: "BUILDING" });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBe(1);
    expect(body.resolved).toBe(0);
    expect(mocks.notifyAdsenseDeploymentResult).not.toHaveBeenCalled();
  });

  it("state READY → helper 호출 (텔레그램 + dedup 자동)", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: { deployment_id: "dpl_ready" },
    });
    mocks.getDeploymentById.mockResolvedValue({
      id: "dpl_ready",
      state: "READY",
      url: "abc.vercel.app",
    });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.resolved).toBe(1);
    expect(mocks.notifyAdsenseDeploymentResult).toHaveBeenCalledOnce();
    const call = (mocks.notifyAdsenseDeploymentResult.mock.calls as unknown as Array<[{ deploymentId: string; state: string; url?: string }]>)[0][0];
    expect(call.deploymentId).toBe("dpl_ready");
    expect(call.state).toBe("READY");
    expect(call.url).toBe("abc.vercel.app");
  });

  it("state ERROR → helper 호출 (state=ERROR)", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: { deployment_id: "dpl_err" },
    });
    mocks.getDeploymentById.mockResolvedValue({ id: "dpl_err", state: "ERROR" });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.resolved).toBe(1);
    expect(mocks.notifyAdsenseDeploymentResult).toHaveBeenCalled();
    const call = (mocks.notifyAdsenseDeploymentResult.mock.calls as unknown as Array<[{ deploymentId: string; state: string }]>)[0][0];
    expect(call.state).toBe("ERROR");
  });

  it("getDeploymentById throw → continue (다음 trigger 영향 0)", async () => {
    mocks.triggers.push(
      {
        id: "a1",
        created_at: new Date().toISOString(),
        details: { deployment_id: "dpl_fail" },
      },
      {
        id: "a2",
        created_at: new Date().toISOString(),
        details: { deployment_id: "dpl_ok" },
      },
    );
    mocks.getDeploymentById
      .mockRejectedValueOnce(new Error("Vercel API 401"))
      .mockResolvedValueOnce({ id: "dpl_ok", state: "READY", url: "x.vercel.app" });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBeGreaterThanOrEqual(1);
    expect(mocks.notifyAdsenseDeploymentResult).toHaveBeenCalled();
  });
});
