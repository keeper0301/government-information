import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

vi.mock("@/lib/ai", () => ({
  generateBlogPost: vi.fn(),
  detectDescriptionCopy: vi.fn(() => null),
  detectMetaCopy: vi.fn(() => null),
}));

vi.mock("@/lib/naver-blog/queue", () => ({
  enqueueNaverBlog: vi.fn(),
}));

vi.mock("@/lib/wordpress/publisher", () => ({
  publishToWordPress: vi.fn(),
}));

vi.mock("@/lib/blog/quality-learning", () => ({
  getRecentQualityImprovementHints: vi.fn(async () => []),
}));

vi.mock("@/lib/blog/trend-learning", () => ({
  getRecentBlogTrendHints: vi.fn(async () => []),
}));

vi.mock("@/lib/blog/external-channel-learning", () => ({
  getRecentExternalChannelLearningHints: vi.fn(async () => []),
}));

vi.mock("@/lib/blog/quality-check", () => ({
  evaluateBlogQuality: vi.fn(),
  isTransientQualityReviewFailure: vi.fn(() => false),
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: vi.fn(),
}));

import { BLOG_PICK_PAGE_SIZE, pickProgramsForCategory } from "@/lib/blog-publish";

type Row = Record<string, unknown> & { id: string; title: string };

function makeProgram(id: string, title = id): Row {
  return {
    id,
    title,
    category: "소상공인",
    target: "소상공인",
    description: "소상공인 지원",
    eligibility: null,
    benefits: null,
    apply_method: null,
    apply_url: null,
    apply_start: null,
    apply_end: null,
    source: "test",
    region: null,
  };
}

function installSupabaseMock(tables: Record<string, Row[]>) {
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      not: vi.fn(() => query),
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async (from: number, to: number) => ({
        data: (tables[table] ?? []).slice(from, to + 1),
        error: null,
      })),
    };
    return query;
  });
}

describe("blog publish 후보 페이지네이션", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("상위 30개가 이미 발행됐어도 더 깊은 welfare 페이지에서 MAX 후보를 채운다", async () => {
    const used = Array.from({ length: BLOG_PICK_PAGE_SIZE }, (_, i) => `w${i + 1}`);
    const welfare = [
      ...used.map((id) => makeProgram(id)),
      ...Array.from({ length: 8 }, (_, i) => makeProgram(`w_new_${i + 1}`)),
    ];
    const blogPosts = used.map((id) => ({
      id: `post_${id}`,
      title: `post_${id}`,
      source_program_id: id,
      source_program_type: "welfare",
    }));
    installSupabaseMock({
      blog_posts: blogPosts,
      welfare_programs: welfare,
      loan_programs: [],
    });

    const picked = await pickProgramsForCategory("소상공인", 6);

    expect(picked).toHaveLength(6);
    expect(picked.map((p) => p.programId)).toEqual([
      "w_new_1",
      "w_new_2",
      "w_new_3",
      "w_new_4",
      "w_new_5",
      "w_new_6",
    ]);
    expect(mocks.from).toHaveBeenCalledWith("welfare_programs");
    expect(mocks.from).not.toHaveBeenCalledWith("loan_programs");
    expect(console.info).toHaveBeenCalledWith(
      "[blog-publish] candidate scan",
      expect.stringContaining('"used":100'),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[blog-publish] candidate scan",
      expect.stringContaining('"unused":8'),
    );
  });

  it("큐레이션도 예전 20개 창을 넘어 미사용 후보를 찾는다", async () => {
    const used = Array.from({ length: 35 }, (_, i) => `c${i + 1}`);
    const welfare = [
      ...used.map((id) => makeProgram(id)),
      makeProgram("curation_new_1"),
      makeProgram("curation_new_2"),
    ];
    const blogPosts = used.map((id) => ({
      id: `post_${id}`,
      title: `post_${id}`,
      source_program_id: id,
      source_program_type: "welfare",
    }));
    installSupabaseMock({
      blog_posts: blogPosts,
      welfare_programs: welfare,
      loan_programs: [],
    });

    const picked = await pickProgramsForCategory("큐레이션", 1);

    expect(picked).toHaveLength(1);
    expect(picked[0].programId).toBe("curation_new_1");
    expect(console.info).toHaveBeenCalledWith(
      "[blog-publish] candidate scan",
      expect.stringContaining('"matched":37'),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[blog-publish] candidate scan",
      expect.stringContaining('"used":35'),
    );
  });
});
