import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  loadValidToken: vi.fn(),
  publishCarousel: vi.fn(),
  logAdminAction: vi.fn(),
  isExternalPublishQualityApproved: vi.fn(() => true),
  fromCalls: [] as string[],
  firstPub: null as null | { instagram_published_at: string },
  todayCount: 0,
  candidate: null as null | {
    id: string;
    slug: string;
    title: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    instagram_attempt_count: number;
    admin_review_required: boolean;
  },
  blockedByQuality: 0,
  exhaustedAttempts: 0,
}));

function makeBlogPostsQuery(step: number) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
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
  query.limit = vi.fn(() => query);
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
  isExternalPublishQualityApproved: mocks.isExternalPublishQualityApproved,
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
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.loadValidToken.mockResolvedValue({ token: "token", userId: "ig-user", username: "keepioo" });
  mocks.publishCarousel.mockResolvedValue({ ok: true, mediaId: "media", permalink: "https://instagram.example/p/1" });
  mocks.logAdminAction.mockResolvedValue(undefined);
  mocks.isExternalPublishQualityApproved.mockReturnValue(true);
  mocks.fromCalls.length = 0;
  mocks.firstPub = null;
  mocks.todayCount = 0;
  mocks.candidate = {
    id: "post-1",
    slug: "slug-1",
    title: "title",
    meta_description: "meta",
    category: "청년",
    tags: [],
    instagram_attempt_count: 0,
    admin_review_required: false,
  };
  mocks.blockedByQuality = 0;
  mocks.exhaustedAttempts = 0;
  process.env.INSTAGRAM_BYPASS_HOUR_CHECK = "true";
  delete process.env.INSTAGRAM_CRON_DISABLED;
});

describe("instagram-publish dry-run", () => {
  it("reports ready without claiming attempt or calling Graph publish", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      candidate: { id: "post-1", slug: "slug-1", attempt_count: 0 },
    });
    expect(body.cardUrls).toHaveLength(3);
    expect(mocks.publishCarousel).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
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
});
