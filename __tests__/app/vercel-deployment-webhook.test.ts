// /api/webhooks/vercel-deployment — Critical #2 post-redeploy webhook 테스트.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  matches: [] as Array<{ details: { deployment_id?: string }; created_at: string; id: string }>,
  notifyAdsenseDeploymentResult: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({ data: mocks.matches }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/adsense/deployment-message", () => ({
  notifyAdsenseDeploymentResult: mocks.notifyAdsenseDeploymentResult,
}));

import { POST } from "@/app/api/webhooks/vercel-deployment/route";

function webhookReq(payload: unknown, signature?: string): Request {
  const body = JSON.stringify(payload);
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("x-vercel-signature", signature);
  return new Request("https://www.keepioo.com/api/webhooks/vercel-deployment", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  mocks.matches.length = 0;
  mocks.notifyAdsenseDeploymentResult.mockReset();
  delete process.env.VERCEL_WEBHOOK_SECRET; // graceful skip 기본
});

describe("webhook signature 검증", () => {
  it("VERCEL_WEBHOOK_SECRET 미설정 → graceful skip (signature 없어도 통과)", async () => {
    const res = await POST(webhookReq({ type: "test", payload: {} }));
    expect(res.status).toBe(200);
  });

  it("secret 설정 + signature 누락 → 401", async () => {
    process.env.VERCEL_WEBHOOK_SECRET = "test-secret";
    const res = await POST(webhookReq({ type: "test", payload: {} }));
    expect(res.status).toBe(401);
  });

  it("secret 설정 + invalid signature → 401", async () => {
    process.env.VERCEL_WEBHOOK_SECRET = "test-secret";
    const res = await POST(
      webhookReq({ type: "test", payload: {} }, "wrong"),
    );
    expect(res.status).toBe(401);
  });
});

describe("이벤트 필터 + 매칭", () => {
  it("관심 없음 (deployment.created 같은) → 200 skipped", async () => {
    const res = await POST(
      webhookReq({
        type: "deployment.created",
        payload: { deployment: { id: "dpl_xxx" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeTruthy();
  });

  it("deployment.succeeded 인데 deployment_id 매칭 audit 없음 → skipped", async () => {
    mocks.matches.length = 0;
    const res = await POST(
      webhookReq({
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl_unrelated" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toContain("not adsense phase b");
    expect(mocks.notifyAdsenseDeploymentResult).not.toHaveBeenCalled();
  });

  it("deployment.succeeded + 매칭 audit → 텔레그램 발화 (광고 가동)", async () => {
    mocks.matches = [
      {
        id: "audit-1",
        created_at: new Date().toISOString(),
        details: { deployment_id: "dpl_match" },
      },
    ];
    const res = await POST(
      webhookReq({
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl_match", url: "abc.vercel.app" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toBe(true);
    expect(mocks.notifyAdsenseDeploymentResult).toHaveBeenCalledOnce();
    const call = (mocks.notifyAdsenseDeploymentResult.mock.calls as unknown as Array<[{ deploymentId: string; state: string; url?: string }]>)[0][0];
    expect(call.deploymentId).toBe("dpl_match");
    expect(call.state).toBe("READY");
    expect(call.url).toBe("abc.vercel.app");
  });

  it("deployment.error + 매칭 audit → 텔레그램 발화 (실패 안내)", async () => {
    mocks.matches = [
      {
        id: "audit-1",
        created_at: new Date().toISOString(),
        details: { deployment_id: "dpl_fail" },
      },
    ];
    const res = await POST(
      webhookReq({
        type: "deployment.error",
        payload: { deployment: { id: "dpl_fail" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.notifyAdsenseDeploymentResult).toHaveBeenCalled();
    const call = (mocks.notifyAdsenseDeploymentResult.mock.calls as unknown as Array<[{ deploymentId: string; state: string }]>)[0][0];
    expect(call.deploymentId).toBe("dpl_fail");
    expect(call.state).toBe("ERROR");
  });
});
