import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getNaverApprovalCandidate: vi.fn() }));

vi.mock("@/lib/naver-blog/approval-candidate", () => ({
  getNaverApprovalCandidate: mocks.getNaverApprovalCandidate,
}));

import { GET } from "@/app/api/cron/naver-approval-candidate/route";

const OLD_CRON_SECRET = process.env.CRON_SECRET;

function request(token = "test-cron-secret") {
  return new Request("https://www.keepioo.com/api/cron/naver-approval-candidate", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("cron naver approval candidate route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    vi.clearAllMocks();
    mocks.getNaverApprovalCandidate.mockResolvedValue({
      checkedAt: "2026-09-20T00:00:00.000Z",
      status: "ready_for_exact_approval",
      mutation: "none_read_only",
      candidate: { queueId: "queue-1", contentFingerprint: "0123456789abcdef" },
      holdReasons: [],
      safety: ["no_publish"],
    });
  });

  afterEach(() => {
    if (OLD_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_CRON_SECRET;
  });

  it("returns exactly one read-only approval candidate", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "ready_for_exact_approval",
      mutation: "none_read_only",
      candidate: { queueId: "queue-1", contentFingerprint: "0123456789abcdef" },
    });
    expect(mocks.getNaverApprovalCandidate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid cron secret", async () => {
    const response = await GET(request("wrong"));
    expect(response.status).toBe(401);
    expect(mocks.getNaverApprovalCandidate).not.toHaveBeenCalled();
  });

  it("does not label an empty queue as approval-ready", async () => {
    mocks.getNaverApprovalCandidate.mockResolvedValue({
      checkedAt: "2026-09-20T00:00:00.000Z",
      status: "no_candidate",
      mutation: "none_read_only",
      candidate: null,
      holdReasons: ["no_retryable_quality_approved_pending_candidate"],
      safety: ["no_publish"],
    });

    const response = await GET(request());
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      status: "no_candidate",
      candidate: null,
    });
  });
});