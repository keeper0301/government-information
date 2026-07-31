import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  loadValidToken: vi.fn(),
  collectInstagramMediaInsights: vi.fn(),
  logAdminAction: vi.fn(),
  sendOpsAlertTelegram: vi.fn(),
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
vi.mock("@/lib/notifications/telegram-ops-alert", () => ({
  sendOpsAlertTelegram: mocks.sendOpsAlertTelegram,
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
  mocks.rows = [
    {
      id: "post-1",
      slug: "slug-1",
      title: "title 1",
      category: "소상공인",
      instagram_media_id: "media-1",
      instagram_published_at: "2026-07-19T13:03:39.000Z",
    },
  ];
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.loadValidToken.mockResolvedValue({ token: "token", userId: "ig-user", username: "keepioo" });
  mocks.collectInstagramMediaInsights.mockResolvedValue({
    mediaId: "media-1",
    metrics: { reach: 5, saved: 1, shares: 0, profile_activity: 0, total_interactions: 1 },
    requestedMetrics: "reach,saved,shares,profile_activity,total_interactions",
    errors: [],
  });
  mocks.sendOpsAlertTelegram.mockResolvedValue({ ok: true, sent: 1, failed: 0, messageId: 123 });
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
      judgement: {
        status: "save_share_signal",
        count: 1,
        avgReach: 5,
        saveRate: 0.2,
        shareRate: 0,
        postsWithSaves: 1,
      },
      management: {
        severity: "ok",
        needsAction: false,
        alertEligible: false,
      },
      breakdown: {
        dominantCategory: "소상공인",
        categorySkewRisk: true,
        categories: [expect.objectContaining({ key: "소상공인", posts: 1 })],
        hooks: [expect.objectContaining({ key: "small_business_share", label: "사장님에게 공유 · 대상·신청처 먼저" })],
      },
    });
    expect(mocks.collectInstagramMediaInsights).toHaveBeenCalledWith("media-1", "token");
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.sendOpsAlertTelegram).not.toHaveBeenCalled();
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
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "instagram_insights_judgement",
        details: expect.objectContaining({
          judgement: expect.objectContaining({ status: "save_share_signal" }),
          management: expect.objectContaining({ alertEligible: false }),
          breakdown: expect.objectContaining({ dominantCategory: "소상공인" }),
        }),
      }),
    );
    expect(mocks.sendOpsAlertTelegram).not.toHaveBeenCalled();
  });

  it("classifies reach without save/share/profile action as weak hook/CTA signal", async () => {
    mocks.collectInstagramMediaInsights.mockResolvedValueOnce({
      mediaId: "media-1",
      metrics: { reach: 20, saved: 0, shares: 0, profile_activity: 0, total_interactions: 0 },
      requestedMetrics: "reach,saved,shares,profile_activity,total_interactions",
      errors: [],
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.judgement).toMatchObject({
      status: "hook_cta_weak",
      recommendation: expect.stringContaining("저장·공유·프로필 활동이 없다"),
      avgReach: 20,
      saveRate: 0,
      shareRate: 0,
    });
    expect(body.management).toMatchObject({
      severity: "ok",
      needsAction: false,
      alertEligible: false,
    });
  });

  it("alerts and writes judgement audit in live mode when weak signal has enough sample", async () => {
    mocks.rows = Array.from({ length: 10 }, (_, i) => ({
      id: `post-${i}`,
      slug: `slug-${i}`,
      title: `title ${i}`,
      category: "소상공인",
      instagram_media_id: `media-${i}`,
      instagram_published_at: "2026-07-19T13:03:39.000Z",
    }));
    mocks.collectInstagramMediaInsights.mockResolvedValue({
      mediaId: "media-x",
      metrics: { reach: 2, saved: 0, shares: 0, profile_activity: 0, total_interactions: 0 },
      requestedMetrics: "reach,saved,shares,profile_activity,total_interactions",
      errors: [],
    });

    const res = await GET(req("/api/cron/instagram-insights-collect"));
    const body = await res.json();

    expect(body.breakdown).toMatchObject({
      dominantCategory: "소상공인",
      categorySkewRisk: true,
      categorySkew: 1,
    });
    expect(body.management).toMatchObject({
      severity: "watch",
      needsAction: true,
      alertEligible: true,
      categorySkewRisk: true,
      dominantCategory: "소상공인",
    });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instagram_insights_judgement",
        details: expect.objectContaining({
          judgement: expect.objectContaining({ status: "hook_cta_weak", count: 10 }),
          breakdown: expect.objectContaining({ categorySkewRisk: true }),
        }),
      }),
    );
    expect(mocks.sendOpsAlertTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("hook_cta_weak"),
        message: expect.stringContaining("자동 다음 행동"),
      }),
    );
    expect(body.alertResult).toMatchObject({ ok: true, sent: 1 });
  });
});
