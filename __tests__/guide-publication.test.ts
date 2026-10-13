import { beforeEach, describe, expect, it, vi } from "vitest";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import { getGuidePublication, getGuideReviewSnapshot, type GuideOwnerReview } from "@/lib/guide-publication";
import { getGuides } from "@/lib/policy-guides";

vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => false }));
// 승인 기록이 전혀 없는 상황의 차단 동작을 별도로 검사합니다.
vi.mock("@/data/guide-owner-reviews.json", () => ({ default: {} }));
const guide = EDITORIAL_GUIDES.find(item => item.slug === "documents-before-government-benefit")!;
const now = new Date("2026-10-05T10:00:00Z");
let reviews: Record<string, GuideOwnerReview>;
beforeEach(() => {
  reviews = { [guide.slug]: {
    snapshotSha256: getGuideReviewSnapshot(guide, getGuideEvidence(guide)!),
    reviewer: "테스트 운영자", reviewedAt: "2026-10-05T09:00:00Z",
    decision: "approved", originalValueConfirmed: true,
  } };
});

describe("사람 검수와 공개 상태", () => {
  it("출처 확인만으로 공개나 광고를 허용하지 않는다", () => {
    expect(getGuidePublication(guide, {}, now)).toMatchObject({ published: false, adEligible: false });
  });
  it("사람이 승인한 동일 본문과 출처만 공개 대상으로 인정한다", () => {
    expect(getGuidePublication(guide, reviews, now)).toMatchObject({ published: true, reviewer: "테스트 운영자" });
  });
  it("승인 후 본문을 바꾸면 기존 승인을 사용하지 않는다", () => {
    expect(getGuidePublication({ ...guide, posts: [...guide.posts, "변경 내용"] }, reviews, now).published).toBe(false);
  });
  it("출처와 조건 표의 변경도 검수한 버전과 구분한다", () => {
    const evidence = getGuideEvidence(guide)!;
    const changed = { ...evidence, conditions: [{ ...evidence.conditions[0], fact: "바뀐 조건" }] };
    expect(getGuideReviewSnapshot(guide, changed)).not.toBe(reviews[guide.slug].snapshotSha256);
  });
  it.each(["", "날짜 아님", "2026-02-30T09:00:00Z", "2027-01-01T00:00:00Z"])("잘못된 검수일 %s를 승인으로 인정하지 않는다", date => {
    reviews[guide.slug].reviewedAt = date;
    expect(getGuidePublication(guide, reviews, now).published).toBe(false);
  });
  it("독창적 가치 확인이 빠진 승인은 공개하지 않는다", () => {
    reviews[guide.slug].originalValueConfirmed = false;
    expect(getGuidePublication(guide, reviews, now).published).toBe(false);
  });
  it("본문 수정일보다 앞선 검수일로 새 내용을 승인하지 않는다", () => {
    reviews[guide.slug].reviewedAt = "2026-10-04T09:00:00Z";
    expect(getGuidePublication(guide, reviews, now).published).toBe(false);
  });
  it("승인 기록이 없는 기존 글은 공개 목록에 들어가지 않는다", async () => {
    expect(await getGuides(50, { publicationOnly: true })).toEqual([]);
    expect((await getGuides(50)).length).toBeGreaterThan(0);
  });
});
