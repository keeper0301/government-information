import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNaverExtensionStatus: vi.fn(),
}));

vi.mock("@/lib/naver-blog/extension-status", () => ({
  getNaverExtensionStatus: mocks.getNaverExtensionStatus,
}));

import { GET } from "@/app/api/cron/naver-extension-status/route";

const OLD_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnv() {
  if (OLD_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }
  process.env.CRON_SECRET = OLD_CRON_SECRET;
}

function request(token = "test-cron-secret") {
  return new Request("https://www.keepioo.com/api/cron/naver-extension-status", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("cron naver-extension status route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    vi.clearAllMocks();
    mocks.getNaverExtensionStatus.mockResolvedValue({
      checkedAt: "2026-07-19T09:00:00.000Z",
      queue: {
        pending: 2,
        retryablePending: 1,
        blockedPending: 1,
        skippedExtensionFailed: 3,
      },
      audit24h: { success: 0, fail: 1, skipped: 2 },
      recentAudits: [],
      errors: [],
    });
  });

  afterEach(() => restoreEnv());

  it("CRON_SECRET 으로 Naver Extension 상태를 읽기 전용 조회한다", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      queue: { pending: 2, retryablePending: 1, blockedPending: 1 },
      audit24h: { success: 0, fail: 1, skipped: 2 },
    });
    expect(mocks.getNaverExtensionStatus).toHaveBeenCalledTimes(1);
  });

  it("cron secret 불일치는 401", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.getNaverExtensionStatus).not.toHaveBeenCalled();
  });
});
