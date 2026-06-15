import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/cron/alert-delivery-transient-cleanup/route";

const mocks = vi.hoisted(() => {
  const inFilter = vi.fn(async () => ({ error: null, count: 3 }));
  const eqStatus = vi.fn(() => ({ in: inFilter }));
  const eqChannel = vi.fn(() => ({ eq: eqStatus }));
  const del = vi.fn(() => ({ eq: eqChannel }));
  return {
    del,
    eqChannel,
    eqStatus,
    inFilter,
    from: vi.fn(() => ({ delete: del })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

const OLD_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnv() {
  if (OLD_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }
  process.env.CRON_SECRET = OLD_CRON_SECRET;
}

function request(token = "test-secret") {
  return new Request("https://www.keepioo.com/api/cron/alert-delivery-transient-cleanup", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

describe("alert delivery transient cleanup cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    vi.clearAllMocks();
    mocks.inFilter.mockResolvedValue({ error: null, count: 3 } as never);
  });

  afterEach(() => {
    restoreEnv();
  });

  it("카카오 일시 skip 원장만 삭제한다", async () => {
    const response = await POST(request());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deleted: 3,
      transientErrors: [
        "consent_missing",
        "quiet_hours_kst",
        "kakao_provider_not_configured",
      ],
    });
    expect(mocks.from).toHaveBeenCalledWith("alert_deliveries");
    expect(mocks.del).toHaveBeenCalledWith({ count: "exact" });
    expect(mocks.eqChannel).toHaveBeenCalledWith("channel", "kakao");
    expect(mocks.eqStatus).toHaveBeenCalledWith("status", "skipped");
    expect(mocks.inFilter).toHaveBeenCalledWith("error", [
      "consent_missing",
      "quiet_hours_kst",
      "kakao_provider_not_configured",
    ]);
  });

  it("CRON_SECRET 불일치는 401", async () => {
    const response = await POST(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("삭제 실패를 500으로 보고한다", async () => {
    mocks.inFilter.mockResolvedValueOnce({
      error: { message: "db failed" },
      count: null,
    } as never);

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "db failed",
    });
  });
});
