import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  loadValidToken: vi.fn(),
  collectInstagramMediaInsights: vi.fn(),
  logAdminAction: vi.fn(),
  rows: [
    {
      id: "post-1",
      slug: "slug-1",
      title: "title 1",
      category: "소상공인",
      instagram_media_id: "media-1",
      instagram_published_at: "2026-07-19T13:03:39.000Z",
    },
  ],
}));

function makeBlogPostsQuery() {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.not = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => Promise.resolve({ data: mocks.rows, error: null }));
  return query;
}

vi.mock("@/lib/cron-auth", () => ({
  authorizeCronRequest: mocks.authorizeCronRequest,
}));
vi.mock("@/lib/instagram/oauth", () => ({
  loadValidToken: mocks.loadValidToken,
}));
vi.mock("@/lib/instagram/insights", () => ({
  collectInstagramMediaInsights: mocks.collectInstagramMediaInsights,
}));
vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "blog_posts") return makeBlogPostsQuery();
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { GET } from "@/app/api/cron/instagram-insights-collect/route";

function req(path = "/api/cron/instagram-insights-collect?dry=1") {
  return new Request(`https://www.keepioo.com${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.loadValidToken.mockResolvedValue({ token: "token", userId: "ig-user", username: "keepioo" });
  mocks.collectInstagramMediaInsights.mockResolvedValue({
    mediaId: "media-1",
    metrics: { reach: 5, saved: 1, shares: 0, profile_activity: 0, total_interactions: 1 },
    requestedMetrics: "reach,saved,shares,profile_activity,total_interactions",
    errors: [],
  });
});

describe("instagram-insights-collect cron", () => {
  it("collects recent published post insights in dry-run without audit writes", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      status: "ok",
      dryRun: true,
      collectedCount: 1,
      totals: { reach: 5, saved: 1, shares: 0, profile_activity: 0, total_interactions: 1 },
    });
    expect(mocks.collectInstagramMediaInsights).toHaveBeenCalledWith("media-1", "token");
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("writes compact audit logs outside dry-run", async () => {
    const res = await GET(req("/api/cron/instagram-insights-collect"));
    const body = await res.json();

    expect(body.status).toBe("ok");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "instagram_insights_collect",
        details: expect.objectContaining({ mediaId: "media-1" }),
      }),
    );
  });
});
