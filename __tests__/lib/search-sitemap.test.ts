import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fail: false, blog: {} as Record<string, unknown> }));
vi.mock("@/lib/blog-search-reviews.json", () => ({ default: { "검수글": {} } }));
vi.mock("@/lib/search-publication", () => ({
  isPolicySearchPublic: (row: { approved: boolean }) => row.approved,
  isBlogSearchPublic: (row: { approved: boolean }) => row.approved,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  const result = () => ({ error: state.fail ? { message: "연결 실패" } : null,
    data: table === "blog_posts" ? [state.blog] : [{ id: "통과", approved: true }, { id: "보류", approved: false }] });
  const chain = { select: () => chain, eq: () => chain, not: () => chain, is: () => chain,
    in: () => chain, order: () => chain, range: () => Promise.resolve(result()),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
  return chain;
} }) }));
import { loadReviewedSearchPages } from "@/lib/search-sitemap";
beforeEach(() => { state.fail = false; state.blog = { slug: "검수글", approved: true }; });
it("검수 통과 글만 사이트맵에 넣고 한글 주소를 인코딩한다", async () => {
  const pages = await loadReviewedSearchPages("https://www.keepioo.com");
  expect(pages.map(page => page.url)).toEqual([
    "https://www.keepioo.com/welfare/통과", "https://www.keepioo.com/loan/통과",
    `https://www.keepioo.com/blog/${encodeURIComponent("검수글")}`,
  ]);
});
it("본문 변경으로 보류된 글을 사이트맵에서도 제외한다", async () => {
  state.blog.approved = false;
  expect((await loadReviewedSearchPages("https://www.keepioo.com")).length).toBe(2);
});
it("연결 실패를 빈 정상 목록으로 저장하지 않는다", async () => {
  state.fail = true;
  await expect(loadReviewedSearchPages("https://www.keepioo.com")).rejects.toThrow("읽지 못했습니다");
});
