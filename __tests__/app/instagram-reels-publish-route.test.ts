import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  loadValidToken: vi.fn(),
  publishReel: vi.fn(),
  logAdminAction: vi.fn(),
  assessExternalPublishQuality: vi.fn(() => ({
    approved: true,
    reasons: [] as string[],
    metrics: {
      titleLength: 20,
      plainTextLength: 1000,
      metaLength: 120,
      informationSignalCount: 4,
      hasOfficialActionSignal: true,
      hasTemplateSmell: false,
    },
  })),
  fromCalls: [] as string[],
  todayCount: 0,
  candidate: null as null | {
    id: string;
    slug: string;
    title: string;
    content: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    admin_review_required: boolean;
    instagram_reel_video_url: string;
    instagram_reel_attempt_count: number;
  },
  blockedByQuality: 0,
}));

function makeBlogPostsQuery(step: number) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.not = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.lt = vi.fn(() => query);
  query.gte = vi.fn(() => Promise.resolve({ count: mocks.todayCount }));
  query.or = vi.fn(() => Promise.resolve({ count: mocks.blockedByQuality }));
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => Promise.resolve({ data: mocks.candidate, error: null }));
  query.update = vi.fn(() => query);
  if (step > 1) query.select = vi.fn(() => Promise.resolve({ data: [{ id: "post-1", instagram_reel_attempt_count: 1 }], error: null }));
  return query;
}

vi.mock("@/lib/cron-auth", () => ({
  authorizeCronRequest: mocks.authorizeCronRequest,
}));
vi.mock("@/lib/instagram/oauth", () => ({
  loadValidToken: mocks.loadValidToken,
}));
vi.mock("@/lib/instagram/reels", () => ({
  publishReel: mocks.publishReel,
}));
vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock("@/lib/blog/quality-gate", () => ({
  assessExternalPublishQuality: mocks.assessExternalPublishQuality,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      mocks.fromCalls.push(table);
      if (table === "blog_posts") return makeBlogPostsQuery(mocks.fromCalls.filter((t) => t === "blog_posts").length - 1);
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { GET } from "@/app/api/cron/instagram-reels-publish/route";

function req(path = "/api/cron/instagram-reels-publish?dry=1") {
  return new Request(`https://www.keepioo.com${path}`);
}

beforeEach(() => {
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.loadValidToken.mockResolvedValue({ token: "token", userId: "ig-user", username: "keepioo" });
  mocks.publishReel.mockResolvedValue({ ok: true, mediaId: "reel-media", permalink: "https://instagram.example/reel/1" });
  mocks.logAdminAction.mockResolvedValue(undefined);
  mocks.assessExternalPublishQuality.mockReturnValue({
    approved: true,
    reasons: [] as string[],
    metrics: {
      titleLength: 20,
      plainTextLength: 1000,
      metaLength: 120,
      informationSignalCount: 4,
      hasOfficialActionSignal: true,
      hasTemplateSmell: false,
    },
  });
  mocks.fromCalls.length = 0;
  mocks.todayCount = 0;
  mocks.candidate = {
    id: "post-1",
    slug: "slug-1",
    title: "title",
    content: "대상 신청 기간 서류 문의 공식 지원 금액 ".repeat(40),
    meta_description: "meta",
    category: "청년",
    tags: [],
    admin_review_required: false,
    instagram_reel_video_url: "https://cdn.keepioo.com/reels/slug-1.mp4",
    instagram_reel_attempt_count: 0,
  };
  mocks.blockedByQuality = 0;
  process.env.INSTAGRAM_REELS_AUTO_ENABLED = "true";
  process.env.INSTAGRAM_REELS_BYPASS_HOUR_CHECK = "true";
  delete process.env.INSTAGRAM_REELS_DAILY_CAP;
});

describe("instagram-reels-publish dry-run", () => {
  it("reports ready without calling Graph publish", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      candidate: {
        id: "post-1",
        slug: "slug-1",
        attempt_count: 0,
        videoUrl: "https://cdn.keepioo.com/reels/slug-1.mp4",
      },
    });
    expect(mocks.publishReel).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("stays disabled by default and does not touch DB", async () => {
    delete process.env.INSTAGRAM_REELS_AUTO_ENABLED;

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ dryRun: true, status: "disabled" });
    expect(mocks.fromCalls).toHaveLength(0);
    expect(mocks.publishReel).not.toHaveBeenCalled();
  });

  it("returns quality gate reasons in dry-run", async () => {
    mocks.assessExternalPublishQuality.mockReturnValue({
      approved: false,
      reasons: ["content_too_short_for_external_publish"],
      metrics: {
        titleLength: 20,
        plainTextLength: 0,
        metaLength: 120,
        informationSignalCount: 3,
        hasOfficialActionSignal: true,
        hasTemplateSmell: false,
      },
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "quality_gate_rejected",
      slug: "slug-1",
      reasons: ["content_too_short_for_external_publish"],
      metrics: { plainTextLength: 0 },
    });
    expect(mocks.publishReel).not.toHaveBeenCalled();
  });
});
