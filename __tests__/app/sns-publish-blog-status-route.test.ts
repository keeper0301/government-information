import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  checkThreadsCredentials: vi.fn(),
  blogRows: [] as Array<{ id: string; title: string; slug: string; published_at: string; admin_review_required: boolean }>,
  actionRows: [] as Array<{ created_at: string; details: { id: string; title: string; results: Array<{ channel: string; ok: boolean; id?: string; reason?: string }> } }>,
}));

vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock("@/lib/sns/credential-check", () => ({ checkThreadsCredentials: mocks.checkThreadsCredentials }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const builder = {
        data: table === "admin_actions" ? mocks.actionRows : mocks.blogRows,
        error: null,
        select: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
      };
      return builder;
    },
  }),
}));

import { GET } from "@/app/api/cron/sns-publish-blog-status/route";

function req() {
  return new Request("https://www.keepioo.com/api/cron/sns-publish-blog-status");
}

beforeEach(() => {
  process.env.THREADS_USER_ID = "threads-user";
  process.env.THREADS_ACCESS_TOKEN = "threads-token";
  delete process.env.THREADS_AUTO_PUBLISH_ENABLED;
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.checkThreadsCredentials.mockResolvedValue({
    ready: true,
    checked: true,
    ok: true,
    reason: null,
    httpStatus: 200,
    missing: [],
  });
  mocks.blogRows = [
    {
      id: "post-1",
      title: "2026년 노란우산공제 소득공제 최대 600만원",
      slug: "noran-usan",
      published_at: "2026-07-27T00:00:00.000Z",
      admin_review_required: false,
    },
  ];
  mocks.actionRows = [
    {
      created_at: "2026-07-27T03:36:05.000Z",
      details: {
        id: "post-2",
        title: "다음 글",
        results: [{ channel: "threads", ok: false, reason: "threads_daily_cap_reached" }],
      },
    },
    {
      created_at: "2026-07-27T03:36:03.000Z",
      details: {
        id: "post-1",
        title: "첫 글",
        results: [{ channel: "threads", ok: true, id: "threads-media-id" }],
      },
    },
  ];
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ username: "keeper.punch" }), { status: 200 })) as typeof fetch;
});

describe("sns-publish-blog-status", () => {
  it("성공 후 daily cap은 장애 blocker가 아니라 cadence 상태로 보고하고 keeper.punch preview를 노출한다", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.blockers).not.toContain("threads_daily_cap_reached");
    expect(body.cadence).toEqual({
      dailyCapReached: true,
      minIntervalReached: false,
      status: "capped_until_next_window",
    });
    expect(body.threadsIdentity).toEqual({ username: "keeper.punch", ok: true, reason: null });
    expect(body.nextThreadsPreview.text).toContain("@keepioo_official");
    expect(body.nextThreadsPreview.text).toMatch(/댓글에\s+\*\*노란우산\*\*/);
    expect(body.nextThreadsPreview.commentKeyword).toBe("노란우산");
    expect(body.nextThreadsPreview.hasKeepiooMention).toBe(true);
    expect(body.nextThreadsPreview.hasDirectBlogUrl).toBe(false);
    expect(body.nextThreadsPreview.hasCommentKeywordCta).toBe(true);
  });
});
