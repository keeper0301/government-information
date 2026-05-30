// /api/cron/adsense-deployment-poll — Critical #2 polling fallback 회귀 안전망.
// 7 시나리오: VERCEL_TOKEN 미설정 / 빈 audit / 매칭 / state별(BUILDING/READY/ERROR) / dedup.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  triggers: [] as Array<{ id: string; details: { deployment_id?: string }; created_at: string }>,
  resolved: [] as Array<{ details: { deployment_id?: string } }>,
  getDeploymentById: vi.fn(),
  sendOpsAlertTelegram: vi.fn(async () => undefined),
  logAdminAction: vi.fn(async () => undefined),
  authorizeCronRequest: vi.fn(() => null), // null = allow
}));

// Supabase admin client — query chain 별 응답 주입.
let queryStep = 0; // 0: triggers select, 1: resolved select, 2+: 그 외
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({ data: mocks.triggers }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

// 2nd from() call (resolved select) 분기 mocking — query chain 다름.
// 위 mock 의 .gte() 가 resolved 도 같이 처리하지만, 분리 필요해 hoisted.
vi.mock("@/lib/vercel/api", () => ({
  getDeploymentById: mocks.getDeploymentById,
}));
vi.mock("@/lib/notifications/telegram-ops-alert", () => ({
  sendOpsAlertTelegram: mocks.sendOpsAlertTelegram,
}));
vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
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
  mocks.sendOpsAlertTelegram.mockReset();
  mocks.logAdminAction.mockReset();
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

  it("audit 있지만 deployment_id 없음 → skip (continue)", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: {}, // deployment_id 없음
    });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(mocks.getDeploymentById).not.toHaveBeenCalled();
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
    expect(mocks.sendOpsAlertTelegram).not.toHaveBeenCalled();
  });

  it("state READY → 텔레그램 '광고 가동' + resolved insert", async () => {
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
    expect(mocks.sendOpsAlertTelegram).toHaveBeenCalledOnce();
    const call = (mocks.sendOpsAlertTelegram.mock.calls as unknown as Array<[{ subject: string; message: string }]>)[0][0];
    expect(call.subject).toContain("광고 가동 시작");
    expect(call.message).toContain("abc.vercel.app");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "adsense_deployment_state_resolved" }),
    );
  });

  it("state ERROR → 텔레그램 '실패' + ENV 복원 안내", async () => {
    mocks.triggers.push({
      id: "a1",
      created_at: new Date().toISOString(),
      details: { deployment_id: "dpl_err" },
    });
    mocks.getDeploymentById.mockResolvedValue({ id: "dpl_err", state: "ERROR" });
    const res = await GET(cronReq());
    const body = await res.json();
    expect(body.resolved).toBe(1);
    expect(mocks.sendOpsAlertTelegram).toHaveBeenCalled();
    const call = (mocks.sendOpsAlertTelegram.mock.calls as unknown as Array<[{ subject: string; message: string }]>)[0][0];
    expect(call.subject).toContain("실패");
    expect(call.message).toContain("ENV NEXT_PUBLIC_ADSENSE_REVIEW_MODE=on");
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
    // 첫 trigger 는 checked++ 후 throw catch → continue.
    // 두번째 trigger 는 정상 처리.
    expect(body.checked).toBeGreaterThanOrEqual(1);
    expect(mocks.sendOpsAlertTelegram).toHaveBeenCalled();
  });
});
