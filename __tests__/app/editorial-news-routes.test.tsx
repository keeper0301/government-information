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
    getPublishedNewsReview: () => state.published ? { reviewer: "운영자", reviewedAt: "2026-10-09T10:00:00Z", publishedAt: "2026-10-05T14:00:00Z" } : undefined,
  };
});
// 재심사 페이지에서 자동 수집 자료를 조회하면 검사를 실패시킵니다.
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("미검수 자료 조회 금지"); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("미검수 자료 조회 금지"); } }));
vi.mock("@/lib/policy-guides", () => ({ getGuides: async () => [] }));

afterEach(() => { state.published = false; });

describe("재심사 정책뉴스 화면", () => {
  it("정정한 글은 정정 사유와 수정 시각을 표시하고 최초 발행일을 유지한다", async () => {
    state.published = true;
    const { EditorialNewsDetail } = await import("@/components/news/editorial-news-pages");
    const article = { ...EDITORIAL_NEWS[0], editorialCorrection: {
      correctedAt: "2026-10-07T02:00:00Z", summary: "행사 참여자 대상 후속 안내로 바로잡았습니다.",
    } };
    const html = renderToStaticMarkup(await EditorialNewsDetail({ article }));
    expect(html).toContain("원문 대조 정정");
    expect(html).toContain(article.editorialCorrection.summary);
    expect(html).toContain('"dateModified":"2026-10-07T02:00:00Z"');
    expect(html).toContain('"datePublished":"2026-10-05T14:00:00Z"');
    expect(html).toContain('최초 발행일: 2026-10-05');
  });
  it("공개한 뉴스에만 자료사진과 이용 조건을 표시한다", async () => {
    const { EditorialNewsIndex } = await import("@/components/news/editorial-news-pages");
    expect(renderToStaticMarkup(<EditorialNewsIndex />)).not.toContain("jeongeup-market.webp");
    state.published = true;
    const html = renderToStaticMarkup(<EditorialNewsIndex />);
    expect(html).toContain('src="/images/news/jeongeup-market-480.webp"');
    expect(html).toContain("2011년 자료사진");
    expect(html).toContain("Ulrich Lange");
    expect(html).toContain("https://creativecommons.org/licenses/by-sa/3.0/deed.ko");
  });
  it("검색어와 선택 분야를 실제 목록에 적용한다", async () => {
    state.published = true;
    const { default: Page } = await import("@/app/news/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "온누리", benefit: "금융", province: "nationwide" }) })).replace(/<!--.*?-->/g, "");
    expect(html).toContain("검색 결과 1건");
    expect(html).toContain('value="온누리"');
    expect(html).toContain('value="금융"');
    expect(html).toContain('value="nationwide"');
    expect(html).toContain(EDITORIAL_NEWS[0].title);
  });
  it("일치하지 않는 검색은 안내와 전체 보기만 제공한다", async () => {
    state.published = true;
    const { default: Page } = await import("@/app/news/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "없는내용" }) }));
    expect(html).toContain("조건에 맞는 정책뉴스가 없습니다");
    expect(html).not.toContain(EDITORIAL_NEWS[0].title);
  });
  it("검색 제출 목록에는 승인된 상세만 포함한다", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    expect((await sitemap()).some(item => item.url.includes("/news"))).toBe(false);
    state.published = true;
    const items = await sitemap();
    expect(items.some(item => item.url.endsWith(`/news/${EDITORIAL_NEWS[0].slug}`))).toBe(true);
    // 이 검사에서는 모든 편집 초안을 승인된 것으로 흉내 내므로 세 편이 되면 목록도 포함된다.
    expect(items.some(item => item.url.endsWith("/news"))).toBe(EDITORIAL_NEWS.length >= 3);
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
    const { EditorialNewsIndex, EditorialNewsDetail, EditorialNewsCards } = await import("@/components/news/editorial-news-pages");
    expect(renderToStaticMarkup(<EditorialNewsIndex />)).toContain(EDITORIAL_NEWS[0].title);
    // 보호: 최초 발행일 유지. 실패: 확인일을 카드 날짜로 사용. 이유: 상세 검사로는 목록 누락을 못 잡음. 별도 시험 구조: 없음.
    const card = renderToStaticMarkup(<EditorialNewsCards articles={[EDITORIAL_NEWS[0]]} />);
    expect(card).toContain('2026년 10월 5일');
    expect(card).not.toContain('2026년 10월 9일');
    const html = renderToStaticMarkup(await EditorialNewsDetail({ article: EDITORIAL_NEWS[0] }));
    expect(html).toContain("할인 안내문을 붙이기 전에 확인할 순서");
    expect(html).toContain("상권별 발표 혜택 비교");
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
