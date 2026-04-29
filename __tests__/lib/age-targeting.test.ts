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

describe("getAgeCounts 매칭 로직 (NULL/range/household)", () => {
  // mock supabase client — sitemap 빌드 시 호출되는 .from().select().not().or() chain
  function mockSupabase(
    rows: Array<{
      age_target_min: number | null;
      age_target_max: number | null;
      household_target_tags: string[] | null;
    }>,
  ) {
    return {
      from: () => ({
        select: () => ({
          not: () => ({
            or: () => ({ data: rows }),
          }),
        }),
      }),
    };
  }

  it("age 범위 매칭 — youth(19~34) 는 row [25, 30] 매칭", async () => {
    const { getAgeCounts } = await import("@/lib/age-targeting");
    const supabase = mockSupabase([
      { age_target_min: 25, age_target_max: 30, household_target_tags: [] },
    ]);
    const counts = await getAgeCounts(supabase, "welfare_programs", "()");
    expect(counts.get("youth")).toBe(1);
  });

  it("age_target NULL + tags 비어있는 row 는 어느 카테고리에도 매칭 안 함 (over-recall 가드)", async () => {
    const { getAgeCounts } = await import("@/lib/age-targeting");
    const supabase = mockSupabase([
      { age_target_min: null, age_target_max: null, household_target_tags: [] },
    ]);
    const counts = await getAgeCounts(supabase, "welfare_programs", "()");
    // 핵심 안전장치: implementer 가 의도적으로 `(ageMin !== null || ageMax !== null)`
    // 가드를 넣어 age range 매칭에서 둘 다 NULL 인 row 를 제외 → over-recall 차단.
    // 이로써 sitemap 카운트 변별력 보장 (각 페이지가 같은 모든 정책 중복 노출 방지).
    expect(counts.size).toBe(0);
  });

  it("householdTags 매칭 — parent 는 row tags ['multi_child'] 매칭", async () => {
    const { getAgeCounts } = await import("@/lib/age-targeting");
    const supabase = mockSupabase([
      {
        age_target_min: null,
        age_target_max: null,
        household_target_tags: ["multi_child"],
      },
    ]);
    const counts = await getAgeCounts(supabase, "welfare_programs", "()");
    expect(counts.get("parent")).toBe(1);
  });

  it("range + household 합집합 — senior 는 elderly tag 만으로도 매칭", async () => {
    const { getAgeCounts } = await import("@/lib/age-targeting");
    const supabase = mockSupabase([
      {
        age_target_min: 30, // youth/middle 범위와 겹침
        age_target_max: 50,
        household_target_tags: ["elderly"],
      },
    ]);
    const counts = await getAgeCounts(supabase, "welfare_programs", "()");
    // age range 로 youth(19~34, 30 겹침) + middle(35~49, 50 겹침) 매칭
    expect(counts.get("youth")).toBe(1);
    expect(counts.get("middle")).toBe(1);
    // householdTags=elderly 로 senior 도 매칭 (range 안 겹쳐도)
    expect(counts.get("senior")).toBe(1);
  });
});
