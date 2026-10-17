import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSignals } from "@/lib/personalization/types";
const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], score: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const query = { select: () => query, neq: () => query, overlaps: () => query,
    not: () => query, eq: () => query, order: () => query,
    limit: async () => ({ data: mocks.rows }) };
  return query;
} }) }));
vi.mock("@/lib/personalization/filter", () => ({ scoreAndFilterWithPopularity: mocks.score }));
vi.mock("@/lib/personalization/score", () => ({ isProgramAllowedForUser: () => true }));
vi.mock("@/lib/personalization/blog-cohort", () => ({ isBlogCohortFit: () => true }));
import { getRelatedBlogs, getRelatedNews } from "@/lib/recommend";
const signals: UserSignals = {ageGroup:null, region:null, district:null, occupation:null, incomeLevel:null, householdTypes:[], benefitTags:[], hasChildren:null, merit:null};
const options = {age:null, occupation:null, signals};
const blog = {slug:"safe", title:"100만원", content:"본문", meta_description:null, tags:[], faqs:[], category:"큐레이션", cover_image:null, published_at:"2026-01-01", admin_review_required:false, admin_reviewed_at:null, admin_review_score:null};
describe("readable blog recommendation boundary", () => {
  beforeEach(() => { mocks.rows=[]; mocks.score.mockReset().mockResolvedValue([]); });
  it("keeps normal news recommendations without blog approval fields", async () => {
    mocks.rows=[{id:"news",slug:"news",title:"뉴스",body:"본문",benefit_tags:[]}];
    expect(await getRelatedNews(options)).toHaveLength(1);
  });
  it.each([false,true])("filters bad blogs before scoring and fallback (scored=%s)", async scored => {
    mocks.rows=[blog,{...blog,slug:"bad",faqs:[{answer:"N만원"}]},{...blog,slug:"failed",admin_review_score:2}];
    if(scored) mocks.score.mockImplementation(async items=>items.map((item:unknown)=>({item,score:9})));
    expect((await getRelatedBlogs(options)).map(row=>row.slug)).toEqual(["safe"]);
    expect(mocks.score.mock.calls[0][0]).toHaveLength(1);
  });
});
