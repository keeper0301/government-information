import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import GuidePage, { generateMetadata } from "@/app/guides/[slug]/page";
import { HomeEditorialShell } from "@/components/home-editorial-shell";

const state = vi.hoisted(() => ({ published: false }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => false }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("페이지 없음"); } }));
vi.mock("@/lib/guide-publication", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/guide-publication")>();
  return { ...original, getGuidePublication: () => ({ published: state.published, adEligible: false,
    reviewer: state.published ? "테스트 운영자" : undefined, reviewedAt: state.published ? "2026-10-05" : undefined }) };
});
const guide = EDITORIAL_GUIDES.find(item => item.slug === "documents-before-government-benefit")!;
const props = { params: Promise.resolve({ slug: guide.slug }) };

describe("공개 화면의 검수 경계", () => {
  it("검수 대기 상세를 검색 제외하고 본문과 기사 정보를 공개하지 않는다", async () => {
    state.published = false;
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
    const html = renderToStaticMarkup(await GuidePage(props));
    expect(html).toContain("편집 검수 중");
    expect(html).not.toContain(guide.posts[0]);
    expect(html).not.toContain('application/ld+json');
  });
  it("승인된 상세에는 본문과 검수 기록을 함께 보여준다", async () => {
    state.published = true;
    expect((await generateMetadata(props)).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await GuidePage(props));
    expect(html).toContain(guide.posts[0]);
    expect(html).toContain("테스트 운영자");
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain("운영자 편집 검수 대기");
    expect(html).toContain(getGuideEvidence(guide)!.sources[0].url.replace(/&/g, "&amp;"));
  });
  it("홈에서 미검수 가이드를 추천하지 않는다", async () => {
    state.published = false;
    const html = renderToStaticMarkup(await HomeEditorialShell());
    for (const item of EDITORIAL_GUIDES) expect(html).not.toContain(`/guides/${item.slug}`);
    expect(html).toContain("검수");
  });
});
