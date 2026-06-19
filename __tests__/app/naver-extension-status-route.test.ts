import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNaverExtensionStatus: vi.fn(),
}));

vi.mock("@/lib/naver-blog/extension-status", () => ({
  getNaverExtensionStatus: mocks.getNaverExtensionStatus,
}));

import { GET } from "@/app/api/naver-extension/status/route";

const OLD_SECRET = process.env.NAVER_EXTENSION_SECRET;

function restoreEnv() {
  if (OLD_SECRET === undefined) {
    delete process.env.NAVER_EXTENSION_SECRET;
    return;
  }
  process.env.NAVER_EXTENSION_SECRET = OLD_SECRET;
}

function request(token = "test-secret") {
  return new Request("https://www.keepioo.com/api/naver-extension/status", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("naver-extension status route", () => {
  beforeEach(() => {
    process.env.NAVER_EXTENSION_SECRET = "test-secret";
    vi.clearAllMocks();
    mocks.getNaverExtensionStatus.mockResolvedValue({
      checkedAt: "2026-06-19T03:00:00.000Z",
      queue: {
        pending: 4,
        retryablePending: 3,
        blockedPending: 1,
        skippedExtensionFailed: 2,
      },
      audit24h: { success: 1, fail: 2, skipped: 3 },
      recentAudits: [],
      errors: [],
    });
  });

  afterEach(() => restoreEnv());

  it("확장 secret 으로 큐·audit 요약을 읽는다", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      queue: {
        pending: 4,
        retryablePending: 3,
        blockedPending: 1,
        skippedExtensionFailed: 2,
      },
      audit24h: { success: 1, fail: 2, skipped: 3 },
    });
    expect(mocks.getNaverExtensionStatus).toHaveBeenCalledTimes(1);
  });

  it("DB 일부 조회 에러가 있으면 ok=false 로 상태를 노출한다", async () => {
    mocks.getNaverExtensionStatus.mockResolvedValueOnce({
      checkedAt: "2026-06-19T03:00:00.000Z",
      queue: { pending: 0, retryablePending: 0, blockedPending: 0, skippedExtensionFailed: 0 },
      audit24h: { success: 0, fail: 0, skipped: 0 },
      recentAudits: [],
      errors: ["queue.pending: db failed"],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errors: ["queue.pending: db failed"],
    });
  });

  it("secret 불일치는 401", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.getNaverExtensionStatus).not.toHaveBeenCalled();
  });
});
