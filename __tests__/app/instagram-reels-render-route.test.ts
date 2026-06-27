import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
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
  renderReelVideo: vi.fn(),

  fromCalls: [] as string[],
  storageUploads: [] as { path: string; contentType?: string }[],
  candidate: null as null | {
    id: string;
    slug: string;
    title: string;
    content: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    admin_review_required: boolean;
    instagram_reel_render_attempt_count: number;
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
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.or = vi.fn(() => Promise.resolve({ count: mocks.blockedByQuality }));
  query.maybeSingle = vi.fn(() => Promise.resolve({ data: mocks.candidate, error: null }));
  query.update = vi.fn(() => query);
  if (step === 1) query.select = vi.fn(() => Promise.resolve({ data: [{ id: "post-1", instagram_reel_render_attempt_count: 1 }], error: null }));
  return query;
}


vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock("@/lib/admin-actions", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("@/lib/blog/quality-gate", () => ({ assessExternalPublishQuality: mocks.assessExternalPublishQuality }));
vi.mock("@/lib/instagram/reel-video-render", () => ({ renderReelVideo: mocks.renderReelVideo }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      mocks.fromCalls.push(table);
      if (table === "blog_posts") return makeBlogPostsQuery(mocks.fromCalls.filter((t) => t === "blog_posts").length - 1);
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload: (path: string, _bytes: Buffer, opts: { contentType?: string }) => {
          mocks.storageUploads.push({ path, contentType: opts.contentType });
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.keepioo.test/storage/v1/object/public/instagram-reels/${path}` } }),
      }),
    },
  }),
}));

import { GET } from "@/app/api/cron/instagram-reels-render/route";

function req(path = "/api/cron/instagram-reels-render?dry=1") {
  return new Request(`https://www.keepioo.com${path}`);
}

beforeEach(() => {
  mocks.authorizeCronRequest.mockReturnValue(null);
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
  mocks.renderReelVideo.mockResolvedValue({ filePath: "package.json", durationSeconds: 15, cleanup: vi.fn() });
  mocks.fromCalls.length = 0;
  mocks.storageUploads.length = 0;
  mocks.candidate = {
    id: "post-1",
    slug: "slug-1",
    title: "title",
    content: "대상 신청 기간 서류 문의 공식 지원 금액 ".repeat(40),
    meta_description: "meta",
    category: "청년",
    tags: [],
    admin_review_required: false,
    instagram_reel_render_attempt_count: 0,
  };
  mocks.blockedByQuality = 0;
  process.env.INSTAGRAM_REELS_RENDER_ENABLED = "true";
});

describe("instagram-reels-render", () => {
  it("dry-run reports ready without rendering or uploading", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ dryRun: true, status: "ready", candidate: { id: "post-1", slug: "slug-1", attempt_count: 0 } });
    expect(mocks.renderReelVideo).not.toHaveBeenCalled();
    expect(mocks.storageUploads).toHaveLength(0);
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("stays disabled by default before touching DB", async () => {
    delete process.env.INSTAGRAM_REELS_RENDER_ENABLED;

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ dryRun: true, status: "disabled" });
    expect(mocks.fromCalls).toHaveLength(0);
  });

  it("renders and uploads mp4 on real run", async () => {
    const res = await GET(req("/api/cron/instagram-reels-render"));
    const body = await res.json();

    if (body.status === "error") throw new Error(body.error);
    expect(body).toMatchObject({ status: "ok", slug: "slug-1", durationSeconds: 15 });
    expect(body.videoUrl).toContain("instagram-reels/");
    expect(mocks.renderReelVideo).toHaveBeenCalledOnce();
    expect(mocks.storageUploads[0]).toMatchObject({ contentType: "video/mp4" });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "instagram_reel_render_success" }));
  });
});
