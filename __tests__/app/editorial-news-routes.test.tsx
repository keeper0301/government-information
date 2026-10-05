import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EDITORIAL_NEWS } from "@/lib/editorial-news-data";

const state = vi.hoisted(() => ({ published: false }));
vi.mock("@/lib/adsense-review-mode", () => ({ ADSENSE_REVIEW_MODE: true }));
vi.mock("@/lib/editorial-news", async () => {
  const { EDITORIAL_NEWS } = await import("@/lib/editorial-news-data");
  return {
    getPublishedNews: () => state.published ? EDITORIAL_NEWS : [],
    getPublishedNewsBySlug: (slug: string) => state.published ? EDITORIAL_NEWS.find(item => item.slug === slug) : undefined,
    getPublishedNewsReview: () => state.published ? { reviewer: "운영자", reviewedAt: "2026-10-05T14:00:00Z" } : undefined,
  };
});
// 재심사 페이지에서 자동 수집 자료를 조회하면 검사를 실패시킵니다.
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("미검수 자료 조회 금지"); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("미검수 자료 조회 금지"); } }));
vi.mock("@/lib/policy-guides", () => ({ getGuides: async () => [] }));

afterEach(() => { state.published = false; });

describe("재심사 정책뉴스 화면", () => {
  it("검색 제출 목록에는 승인된 상세만 포함한다", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    expect((await sitemap()).some(item => item.url.includes("/news"))).toBe(false);
    state.published = true;
    const items = await sitemap();
    expect(items.some(item => item.url.endsWith(`/news/${EDITORIAL_NEWS[0].slug}`))).toBe(true);
    expect(items.some(item => item.url.endsWith("/news"))).toBe(false);
  });
  it("승인 전 목록은 검수 안내만 보여준다", async () => {
    const { default: Page } = await import("@/app/news/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("정책뉴스를 검수하고 있습니다");
    expect(html).not.toContain(EDITORIAL_NEWS[0].title);
  });
  it("미검수 상세는 본문과 광고를 숨기고 검색 등록을 차단한다", async () => {
    const { default: Page, generateMetadata } = await import("@/app/news/[slug]/page");
    const props = { params: Promise.resolve({ slug: EDITORIAL_NEWS[0].slug }) };
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
    expect(renderToStaticMarkup(await Page(props))).toContain("이 정책뉴스는 검수 중입니다");
  });
  it("승인된 목록과 상세에는 자체 안내와 공식 출처가 나온다", async () => {
    state.published = true;
    const { EditorialNewsIndex, EditorialNewsDetail } = await import("@/components/news/editorial-news-pages");
    expect(renderToStaticMarkup(<EditorialNewsIndex />)).toContain(EDITORIAL_NEWS[0].title);
    const html = renderToStaticMarkup(await EditorialNewsDetail({ article: EDITORIAL_NEWS[0] }));
    expect(html).toContain("고객에게 안내하기 전 점검표");
    expect(html).toContain(EDITORIAL_NEWS[0].sourceUrl.replaceAll("&", "&amp;"));
    expect(html).not.toContain("adsbygoogle");
    expect(html).toContain('"@type":"Article"');
  });
  it("승인된 상세의 검색 등록은 허용한다", async () => {
    state.published = true;
    const { generateMetadata } = await import("@/app/news/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: EDITORIAL_NEWS[0].slug }) });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.title).toContain(EDITORIAL_NEWS[0].title);
  });
});
