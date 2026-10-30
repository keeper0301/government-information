import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGuideDraft, approveGuide } from "@/lib/policy/evidence-guide";

const state = vi.hoisted(() => ({ reviews: {} as Record<string, unknown> }));
vi.mock("@/lib/blog-search-reviews.json", () => ({ default: state.reviews }));
import { blogSearchSnapshot, isBlogSearchPublic, isPolicySearchPublic, type SearchBlog } from "@/lib/search-publication";

const post: SearchBlog = { slug: "검수글", title: "공식 안내", content: "원문을 확인한 설명",
  meta_description: "검색 설명", faqs: [], published_at: "2026-01-01" };
beforeEach(() => { for (const key of Object.keys(state.reviews)) delete state.reviews[key]; });

describe("글별 검색 공개", () => {
  it("광고 승인과 무관하게 미검수 글을 제외한다", () => {
    expect(isBlogSearchPublic(post)).toBe(false);
    expect(isPolicySearchPublic({ title: "미검수" })).toBe(false);
  });
  it("확인한 본문만 공개하고 이후 변경과 발행 취소를 차단한다", () => {
    state.reviews[post.slug] = { snapshot: blogSearchSnapshot(post), checkedAt: "2026-01-02" };
    expect(isBlogSearchPublic(post)).toBe(true);
    for (const field of ["title", "content", "meta_description"] as const) {
      expect(isBlogSearchPublic({ ...post, [field]: "변경" })).toBe(false);
    }
    expect(isBlogSearchPublic({ ...post, faqs: [{ answer: "틀린 설명" }] })).toBe(false);
    expect(isBlogSearchPublic({ ...post, published_at: null })).toBe(false);
  });
  it.each(["", "잘못된 날짜", "2999-01-01"])("유효하지 않은 검수일은 제외한다: %s", checkedAt => {
    state.reviews[post.slug] = { snapshot: blogSearchSnapshot(post), checkedAt };
    expect(isBlogSearchPublic(post)).toBe(false);
  });
  it("정책 원문과 설명 승인이 일치해야 하며 숨김·중복은 제외한다", () => {
    const row = { title: "청년 월세", source_url: "https://www.gwgs.go.kr/notice?id=1" };
    const draft = createGuideDraft(row, { url: row.source_url, title: row.title,
      body: "고성군 거주 청년 대상입니다.", checkedAt: "2026-01-01" },
    [{ label: "대상", text: "거주 조건을 확인하세요.", quote: "고성군 거주 청년" }]);
    const policy_guidance = approveGuide(row, draft, "운영자", new Date("2026-01-02"));
    expect(isPolicySearchPublic({ ...row, policy_guidance })).toBe(true);
    expect(isPolicySearchPublic({ ...row, title: "다른 사업", policy_guidance })).toBe(false);
    expect(isPolicySearchPublic({ ...row, is_hidden: true, policy_guidance })).toBe(false);
    expect(isPolicySearchPublic({ ...row, duplicate_of_id: "원본", policy_guidance })).toBe(false);
    expect(isPolicySearchPublic({ ...row, policy_guidance: draft })).toBe(false);
  });
  it("저장소가 질문답변 객체의 키 순서를 바꿔도 같은 검수본이다", () => {
    const before = { ...post, faqs: [{ question: "질문", answer: "답변" }] };
    state.reviews[post.slug] = { snapshot: blogSearchSnapshot(before), checkedAt: "2026-01-02" };
    expect(isBlogSearchPublic({ ...before, faqs: [{ answer: "답변", question: "질문" }] })).toBe(true);
  });
});

it.each(["on", "adsense-approved-live-ads"])("광고 설정 %s가 검색 목록을 일괄 공개하지 않는다", async value => {
  vi.stubEnv("NEXT_PUBLIC_ADSENSE_REVIEW_MODE", value);
  vi.resetModules();
  const { ADSENSE_REVIEW_MODE, reviewModeNoindexRobots } = await import("@/lib/adsense-review-mode");
  expect(ADSENSE_REVIEW_MODE).toBe(value === "on");
  expect(reviewModeNoindexRobots()).toEqual({ index: false, follow: true });
  const { default: robots } = await import("@/app/robots");
  const rules = robots().rules;
  const generalRule = Array.isArray(rules) ? rules.find(rule => rule.userAgent === "*") : rules;
  expect(generalRule?.disallow).toEqual(expect.arrayContaining(["/search", "/compare"]));
  vi.unstubAllEnvs();
});
