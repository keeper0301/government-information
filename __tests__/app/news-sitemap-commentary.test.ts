import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reviewMode: false,
  rows: [
    { slug: "empty-commentary", ai_commentary: "" },
    { slug: "missing-commentary", ai_commentary: null },
    { slug: "usable-commentary", ai_commentary: "신청 전에 소득 기준을 확인하세요." },
    { slug: "short-body", ai_commentary: "신청 안내", body: "<p>짧은 본문</p>" },
  ].map((row) => ({
    title: "정책 안내", category: "policy", keywords: ["정책"], is_hidden: false,
    summary: "공식 신청 안내", classified_at: "2026-01-02", updated_at: "2026-01-03",
    body: "정책 신청 안내 본문입니다. ".repeat(30), thumbnail_url: null,
    source_outlet: null, ...row,
  })),
  bulkNewsQueries: 0,
  curated: { slug: "curated-news", title: "검수를 마친 안내", answer: "원문 근거를 확인했습니다.", updatedAt: "2026-01-03" },
}));

vi.mock("@/lib/search-review-mode", () => ({
  get SEARCH_REVIEW_MODE() { return state.reviewMode; },
  searchReviewNoindexRobots: () => ({ index: false, follow: true }),
}));
vi.mock("@/lib/policy-guides", () => ({ getGuides: async () => [] }));
vi.mock("@/lib/age-targeting", () => ({ AGE_SLUGS: [], getAgeCounts: async () => new Map() }));
vi.mock("@/lib/search-sitemap", () => ({ loadReviewedSearchPages: async () => [] }));
vi.mock("@/lib/news-publication/feed", () => ({
  loadPublishedNews: async () => [state.curated],
  loadPublishedNewsBySlug: async (slug: string) => slug === state.curated.slug ? state.curated : undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      if (table === "news_posts") state.bulkNewsQueries++;
      let rows: Record<string, unknown>[] = table === "news_posts" ? [...state.rows] : [];
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return builder; },
        neq(column: string, value: unknown) { rows = rows.filter((row) => row[column] !== null && row[column] !== value); return builder; },
        not(column: string, operator: string, value: unknown) {
          if (operator === "is" || operator === "eq") rows = rows.filter((row) => row[column] !== value);
          return builder;
        },
        is() { return builder; },
        or() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        range(from: number, to: number) { rows = rows.slice(from, to + 1); return builder; },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: (_col: string, slug: string) => ({
      maybeSingle: async () => ({ data: state.rows.find((row) => row.slug === slug) ?? null }),
    }) }) }),
  }),
}));

import sitemap from "@/app/sitemap";
import { generateMetadata } from "@/app/news/[slug]/page";

const detail = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

describe("bulk news sitemap commentary eligibility", () => {
  it("omits sentinel and NULL commentary when detail is noindex, but keeps a usable long article", async () => {
    const paths = (await sitemap()).map(({ url }) => new URL(url).pathname);
    for (const slug of ["empty-commentary", "missing-commentary", "short-body"]) {
      expect.soft((await detail(slug)).robots).toMatchObject({ index: false });
      expect.soft(paths).not.toContain(`/news/${slug}`);
    }
    expect(paths).toContain("/news/usable-commentary");
    expect((await detail("usable-commentary")).robots).toBeUndefined();
  });

  it("does not consult bulk news or include even usable rows while search review mode is on", async () => {
    state.reviewMode = true;
    state.bulkNewsQueries = 0;
    try {
      const paths = (await sitemap()).map(({ url }) => new URL(url).pathname);
      expect(state.bulkNewsQueries).toBe(0);
      for (const { slug } of state.rows) expect(paths).not.toContain(`/news/${slug}`);
      expect((await detail("usable-commentary")).robots).toMatchObject({ index: false });
      expect(paths).toContain("/news/curated-news");
      expect((await detail("curated-news")).robots).toEqual({ index: true, follow: true });
    } finally {
      state.reviewMode = false;
    }
  });
});
