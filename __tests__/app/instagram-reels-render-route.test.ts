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
  candidates: null as null | Array<{
    id: string;
    slug: string;
    title: string;
    content: string;
    meta_description: string | null;
    category: string;
    tags: string[];
    admin_review_required: boolean;
    instagram_reel_render_attempt_count: number;
  }>,
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
  query.returns = vi.fn(() => Promise.resolve({ data: mocks.candidates ?? (mocks.candidate ? [mocks.candidate] : []), error: null }));
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
  mocks.candidates = null;
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

  it("skips quality-rejected FIFO rows and reports the first approved candidate", async () => {
    mocks.candidates = [
      { ...mocks.candidate!, id: "post-bad", slug: "bad-slug" },
      { ...mocks.candidate!, id: "post-good", slug: "good-slug", instagram_reel_render_attempt_count: 1 },
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
    expect(mocks.assessExternalPublishQuality).toHaveBeenCalledTimes(2);
  });

  it("prioritizes Reels-fit candidates over narrow FIFO topics", async () => {
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
      {
        ...mocks.candidate!,
        id: "post-broad",
        slug: "broad-slug",
        title: "2026년 서울 청년 월세 지원 신청 안내",
        category: "청년 주거",
        meta_description: "소득 조건을 충족한 청년에게 월 최대 20만원을 지원합니다.",
        content: "대상은 19세부터 34세 청년이며 부모와 따로 거주해야 합니다. 지원 금액은 월 최대 20만원이며 최대 12개월까지 받을 수 있습니다. 신청 기간은 2026년 7월까지이며 복지로 또는 주민센터에서 신청할 수 있습니다.",
      },
    ];

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      dryRun: true,
      status: "ready",
      candidate: { id: "post-broad", slug: "broad-slug" },
    });
  });

  it("renders and uploads mp4 on real run with an ASCII-safe storage key", async () => {
    mocks.candidate = { ...mocks.candidate!, slug: "청년-월세/지원" };

    const res = await GET(req("/api/cron/instagram-reels-render"));
    const body = await res.json();

    if (body.status === "error") throw new Error(body.error);
    expect(body).toMatchObject({ status: "ok", slug: "청년-월세/지원", durationSeconds: 15 });
    expect(body.videoUrl).toContain("instagram-reels/");
    expect(mocks.renderReelVideo).toHaveBeenCalledOnce();
    expect(mocks.storageUploads[0]).toMatchObject({ contentType: "video/mp4" });
    expect(mocks.storageUploads[0].path).toMatch(/^\d{4}-\d{2}\/article-readable-v3\/\d+-post-[0-9a-f]+\.mp4$/);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "instagram_reel_render_success" }));
  });
});
