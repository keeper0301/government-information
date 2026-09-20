import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  getNaverPostPerformanceReadback: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock("@/lib/naver-blog/post-performance-readback", () => ({
  getNaverPostPerformanceReadback: mocks.getNaverPostPerformanceReadback,
}));

import { GET } from "@/app/api/cron/naver-post-performance-readback/route";

const contentId = "37d035ba-6afe-4bc3-b868-10810c861d7c";
const queueId = "ba7edd39-e246-46ea-989e-19c6db8fe2bf";
const fingerprint = "14a45ea74c829d2d";
const request = () => new Request(
  `https://www.keepioo.com/api/cron/naver-post-performance-readback?contentId=${contentId}&queueId=${queueId}&fingerprint=${fingerprint}`,
);

describe("GET /api/cron/naver-post-performance-readback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeCronRequest.mockReturnValue(null);
  });

  it("honors cron authentication", async () => {
    const denied = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    mocks.authorizeCronRequest.mockReturnValue(denied);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.getNaverPostPerformanceReadback).not.toHaveBeenCalled();
  });

  it("returns awaiting_publish without inventing no-signal metrics", async () => {
    mocks.getNaverPostPerformanceReadback.mockResolvedValue({
      status: "awaiting_publish",
      rollback: { required: false, reason: null },
      publication: { state: "awaiting_publish" },
      windows: {
        h24: { state: "awaiting_publish" },
        d7: { state: "awaiting_publish" },
      },
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "awaiting_publish",
      windows: { h24: { state: "awaiting_publish" }, d7: { state: "awaiting_publish" } },
    });
  });

  it("fails closed on an identity mismatch", async () => {
    mocks.getNaverPostPerformanceReadback.mockResolvedValue({
      status: "rollback_required",
      rollback: { required: true, reason: "content_changed_after_exact_approval" },
    });
    const response = await GET(request());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, status: "rollback_required" });
  });
});
