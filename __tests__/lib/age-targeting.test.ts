// __tests__/lib/age-targeting.test.ts
// ============================================================
// AGE_CATALOG · getAgeCategory 회귀 방지 테스트
// ============================================================
// /welfare/age/[age] · /loan/age/[age] long-tail SEO 페이지가 의존하는
// 카탈로그가 5종 모두 정의돼 있는지, slug 매칭이 정확한지 검증.
// ============================================================

import { describe, expect, it } from "vitest";
import { AGE_CATALOG, AGE_SLUGS, getAgeCategory } from "@/lib/age-targeting";

describe("age-targeting catalog", () => {
  it("AGE_SLUGS 가 5종이고 모두 catalog 와 일치", () => {
    expect(AGE_SLUGS).toHaveLength(5);
    for (const slug of AGE_SLUGS) {
      expect(AGE_CATALOG[slug].slug).toBe(slug);
    }
  });

  it("getAgeCategory 가 알려진 slug 반환", () => {
    const youth = getAgeCategory("youth");
    expect(youth).not.toBeNull();
    expect(youth?.matchAge?.min).toBe(19);
    expect(youth?.matchAge?.max).toBe(34);
  });

  it("getAgeCategory 가 unknown slug 에 null 반환", () => {
    expect(getAgeCategory("unknown")).toBeNull();
  });

  it("senior 는 matchAge + householdTags 양쪽 정의", () => {
    const senior = getAgeCategory("senior");
    expect(senior?.matchAge?.min).toBe(65);
    expect(senior?.householdTags).toContain("elderly");
  });
});
