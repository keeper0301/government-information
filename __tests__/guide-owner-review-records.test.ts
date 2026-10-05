import { describe, expect, it, vi } from "vitest";
import reviewRecords from "@/data/guide-owner-reviews.json";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuidePublication } from "@/lib/guide-publication";
import { getGuides } from "@/lib/policy-guides";

vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => false }));

describe("운영자가 승인한 다섯 글", () => {
  it("현재 본문과 출처가 승인 기록에 일치한다", () => {
    expect(Object.keys(reviewRecords)).toHaveLength(5);
    for (const slug of Object.keys(reviewRecords)) {
      const guide = EDITORIAL_GUIDES.find(item => item.slug === slug)!;
      expect(getGuidePublication(guide).published).toBe(true);
      expect(getGuidePublication({ ...guide, posts: [...guide.posts, "승인 후 수정"] }).published).toBe(false);
    }
  });
  it("공개 목록은 승인한 다섯 글만 포함한다", async () => {
    expect((await getGuides(50, { publicationOnly: true })).map(item => item.slug).sort())
      .toEqual(Object.keys(reviewRecords).sort());
  });
  it("마감된 청년월세 안내는 공개해도 광고를 허용하지 않는다", () => {
    const guide = EDITORIAL_GUIDES.find(item => item.slug === "youth-rent-checklist-2026")!;
    expect(getGuidePublication(guide)).toMatchObject({ published: true, adEligible: false });
  });
});
