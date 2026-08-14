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
  candidates: null as null | Array<{
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
  }>,
  blockedByQuality: 0,
  latestJudgement: null as null | {
    created_at: string;
    details: { judgement?: { status?: string }; management?: { nextAction?: string } };
  },
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
  query.returns = vi.fn(() => Promise.resolve({ data: mocks.candidates ?? (mocks.candidate ? [mocks.candidate] : []), error: null }));
  query.maybeSingle = vi.fn(() => Promise.resolve({ data: mocks.candidate, error: null }));
  query.update = vi.fn(() => query);
  if (step > 1) query.select = vi.fn(() => Promise.resolve({ data: [{ id: "post-1", instagram_reel_attempt_count: 1 }], error: null }));
  return query;
}

function makeAdminActionsQuery() {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.returns = vi.fn(() => Promise.resolve({ data: mocks.latestJudgement ? [mocks.latestJudgement] : [], error: null }));
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
      if (table === "admin_actions") return makeAdminActionsQuery();
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
    instagram_reel_video_url: "https://cdn.keepioo.com/reels/2026-08/article-readable-v4/123-slug-1.mp4",
    instagram_reel_attempt_count: 0,
  };
  mocks.candidates = null;
  mocks.blockedByQuality = 0;
  mocks.latestJudgement = null;
  process.env.INSTAGRAM_REELS_AUTO_ENABLED = "true";
  process.env.INSTAGRAM_REELS_BYPASS_HOUR_CHECK = "true";
  delete process.env.INSTAGRAM_REELS_DAILY_CAP;
});

describe("instagram-reels-publish dry-run", () => {
  it("freezes Reels publishing while recent Instagram hook/CTA signal is weak", async () => {
    mocks.latestJudgement = {
      created_at: new Date().toISOString(),
      details: {
        judgement: { status: "hook_cta_weak" },
        management: { nextAction: "발행량 확대를 멈추고 카드 1 저장/공유 hook 개선" },
      },
    };

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "frozen_hook_cta_weak",
      latestStatus: "hook_cta_weak",
      freezeWindowHours: 72,
    });
    expect(mocks.fromCalls).toEqual(["admin_actions"]);
    expect(mocks.publishReel).not.toHaveBeenCalled();
  });

  it("force run bypasses weak CTA freeze and daily cap for explicit manual publish", async () => {
    mocks.todayCount = 1;
    process.env.INSTAGRAM_REELS_DAILY_CAP = "1";
    mocks.latestJudgement = {
      created_at: new Date().toISOString(),
      details: {
        judgement: { status: "hook_cta_weak" },
        management: { nextAction: "발행량 확대 중단" },
      },
    };

    const res = await GET(req("/api/cron/instagram-reels-publish?dry=1&force=1"));
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      todayCount: 1,
      dailyCap: 1,
      candidate: { slug: "slug-1" },
    });
    expect(mocks.publishReel).not.toHaveBeenCalled();
  });

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
        videoUrl: "https://cdn.keepioo.com/reels/2026-08/article-readable-v4/123-slug-1.mp4",
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

  it("skips rejected FIFO video rows and reports the first publishable candidate", async () => {
    mocks.candidates = [
      { ...mocks.candidate!, id: "post-bad", slug: "bad-slug" },
      { ...mocks.candidate!, id: "post-good", slug: "good-slug", instagram_reel_attempt_count: 1 },
    ];
    (mocks.assessExternalPublishQuality as unknown as { mockImplementation: (fn: (post: unknown) => unknown) => void }).mockImplementation((post: unknown) => {
      const slug = (post as { slug: string }).slug;
      return {
        approved: slug === "good-slug",
        reasons: slug === "good-slug" ? [] : ["content_too_short_for_external_publish"],
        metrics: {
          titleLength: 20,
          plainTextLength: slug === "good-slug" ? 1000 : 0,
          metaLength: 120,
          informationSignalCount: 4,
          hasOfficialActionSignal: true,
          hasTemplateSmell: false,
        },
      };
    });
    mocks.assessExternalPublishQuality.mockClear();

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      candidate: { id: "post-good", slug: "good-slug", attempt_count: 1 },
    });
    expect(mocks.publishReel).not.toHaveBeenCalled();
    expect(mocks.assessExternalPublishQuality).toHaveBeenCalledTimes(2);
  });

  it("blocks narrow prepared videos before Graph publish", async () => {
    mocks.candidates = [
      {
        ...mocks.candidate!,
        id: "post-narrow",
        slug: "narrow-slug",
        title: "2026년 양양군 무연고자 귀향 지원 안내",
        category: "복지",
        meta_description: "귀향 지원 사업 안내입니다.",
        content: "무연고자와 행려자의 귀향을 지원합니다. 자세한 내용은 담당 기관에 문의하세요.",
      },
    ];

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "quality_gate_rejected",
      slug: "narrow-slug",
      reasons: expect.arrayContaining(["reel_narrow_or_sensitive_topic"]),
    });
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
