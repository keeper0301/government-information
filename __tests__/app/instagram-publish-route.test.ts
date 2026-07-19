import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  loadValidToken: vi.fn(),
  publishCarousel: vi.fn(),
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
  firstPub: null as null | { instagram_published_at: string },
  todayCount: 0,
  candidate: null as null | {
    id: string;
    slug: string;
    title: string;
    content: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    instagram_attempt_count: number;
    admin_review_required: boolean;
  },
  candidates: null as null | Array<{
    id: string;
    slug: string;
    title: string;
    content: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    instagram_attempt_count: number;
    admin_review_required: boolean;
  }>,
  blockedByQuality: 0,
  exhaustedAttempts: 0,
}));

function makeBlogPostsQuery(step: number) {
  const query: Record<string, unknown> = {};
  let updated = false;
  query.select = vi.fn(() => {
    if (updated) return Promise.resolve({ data: [{ id: mocks.candidate?.id ?? "post-1", instagram_attempt_count: 1 }], error: null });
    return query;
  });
  query.update = vi.fn(() => {
    updated = true;
    return query;
  });
  query.not = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.lt = vi.fn(() => query);
  query.gte = vi.fn(() => {
    if (step === 1) return Promise.resolve({ count: mocks.todayCount });
    if (step >= 4) return Promise.resolve({ count: mocks.exhaustedAttempts });
    return query;
  });
  query.or = vi.fn(() => Promise.resolve({ count: mocks.blockedByQuality }));
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => {
    if (step === 2) {
      return Promise.resolve({
        data: mocks.candidates ?? (mocks.candidate ? [mocks.candidate] : []),
        error: null,
      });
    }
    return query;
  });
  query.maybeSingle = vi.fn(() => {
    if (step === 0) return Promise.resolve({ data: mocks.firstPub });
    return Promise.resolve({ data: mocks.candidate, error: null });
  });
  return query;
}

vi.mock("@/lib/cron-auth", () => ({
  authorizeCronRequest: mocks.authorizeCronRequest,
}));
vi.mock("@/lib/instagram/oauth", () => ({
  loadValidToken: mocks.loadValidToken,
}));
vi.mock("@/lib/instagram/publish", () => ({
  publishCarousel: mocks.publishCarousel,
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

import { GET } from "@/app/api/cron/instagram-publish/route";

function req(path = "/api/cron/instagram-publish?dry=1") {
  return new Request(`https://www.keepioo.com${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.loadValidToken.mockResolvedValue({ token: "token", userId: "ig-user", username: "keepioo" });
  mocks.publishCarousel.mockResolvedValue({ ok: true, mediaId: "media", permalink: "https://instagram.example/p/1" });
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
  mocks.firstPub = null;
  mocks.todayCount = 0;
  mocks.candidate = {
    id: "post-1",
    slug: "slug-1",
    title: "title",
    content: "대상 신청 기간 서류 문의 공식 지원 금액 ".repeat(40),
    meta_description: "meta",
    category: "청년",
    tags: [],
    instagram_attempt_count: 0,
    admin_review_required: false,
  };
  mocks.candidates = null;
  mocks.blockedByQuality = 0;
  mocks.exhaustedAttempts = 0;
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("ok"))));
  process.env.INSTAGRAM_BYPASS_HOUR_CHECK = "true";
  delete process.env.INSTAGRAM_CRON_DISABLED;
  delete process.env.INSTAGRAM_DAILY_CAP;
  delete process.env.INSTAGRAM_NEW_ACCOUNT_DAILY_CAP;
  delete process.env.INSTAGRAM_ESTABLISHED_DAILY_CAP;
});

it("allows authenticated force=1 publish-now requests to bypass the hour guard", async () => {
  delete process.env.INSTAGRAM_BYPASS_HOUR_CHECK;

  const res = await GET(req("/api/cron/instagram-publish?force=1"));
  const body = await res.json();

  expect(body).toMatchObject({ status: "ok", slug: "slug-1", mediaId: "media" });
  expect(mocks.publishCarousel).toHaveBeenCalledOnce();
});

describe("instagram-publish dry-run", () => {
  it("reports ready without claiming attempt or calling Graph publish", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      dailyCap: 8,
      isNewAccount: true,
      candidate: { id: "post-1", slug: "slug-1", attempt_count: 0 },
    });
    expect(body.cardUrls).toHaveLength(3);
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("uses configurable established-account daily caps in dry-run", async () => {
    mocks.firstPub = { instagram_published_at: "2026-01-01T00:00:00.000Z" };
    process.env.INSTAGRAM_ESTABLISHED_DAILY_CAP = "24";

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      dailyCap: 24,
      isNewAccount: false,
    });
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
  });

  it("skips rejected FIFO candidates and reports the first approved fallback", async () => {
    const rejected = { ...mocks.candidate!, id: "post-bad", slug: "bad-template" };
    const approved = { ...mocks.candidate!, id: "post-good", slug: "good-policy" };
    mocks.candidates = [rejected, approved];
    mocks.assessExternalPublishQuality
      .mockReturnValueOnce({
        approved: false,
        reasons: ["template_smell_detected"],
        metrics: {
          titleLength: 20,
          plainTextLength: 1000,
          metaLength: 120,
          informationSignalCount: 4,
          hasOfficialActionSignal: true,
          hasTemplateSmell: true,
        },
      })
      .mockReturnValueOnce({
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

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      candidate: { id: "post-good", slug: "good-policy", attempt_count: 0 },
    });
    expect(mocks.assessExternalPublishQuality).toHaveBeenCalledTimes(2);
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
  });

  it("reports not_configured without writing skip audit", async () => {
    mocks.loadValidToken.mockResolvedValue(null);

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ dryRun: true, status: "not_configured" });
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
  });

  it("reports hidden exhausted attempts when no pending eligible post exists", async () => {
    mocks.candidate = null;
    mocks.exhaustedAttempts = 4;

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ dryRun: true, status: "no_pending", exhaustedAttempts: 4 });
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
  });

  it("returns quality gate reasons in dry-run without writing audit", async () => {
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
      reasons: ["content_too_short_for_external_publish"],
      metrics: { plainTextLength: 0 },
    });
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
  });
});
