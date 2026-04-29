// __tests__/lib/category-hubs.test.ts
// ============================================================
// CATEGORY_HUBS · getCategoryHub 회귀 방지 테스트
// ============================================================
// /c/[category] hub 페이지 4종 (youth/senior/business/housing) 카탈로그가
// 일관성 있게 정의돼 있는지 검증.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  buildHubOrClause,
  CATEGORY_HUBS,
  CATEGORY_SLUGS,
  getCategoryHub,
  type CategoryHub,
} from "@/lib/category-hubs";

describe("category-hubs", () => {
  it("4 카테고리 정의 + slug 일관성", () => {
    expect(CATEGORY_SLUGS).toHaveLength(4);
    for (const slug of CATEGORY_SLUGS) {
      expect(CATEGORY_HUBS[slug].slug).toBe(slug);
      // 매칭축 3개 (benefit·age·occupation) 중 최소 1개 이상은 정의돼야
      // hub 페이지가 비어있지 않게 매칭 가능
      const totalAxes =
        CATEGORY_HUBS[slug].benefitTags.length +
        CATEGORY_HUBS[slug].ageTags.length +
        CATEGORY_HUBS[slug].occupationTags.length;
      expect(totalAxes).toBeGreaterThan(0);
    }
  });

  it("getCategoryHub 알려진 slug 반환·unknown null", () => {
    expect(getCategoryHub("youth")?.label).toBe("청년 정책");
    expect(getCategoryHub("unknown")).toBeNull();
  });

  it("각 hub 의 emoji + hero + description 모두 정의", () => {
    for (const slug of CATEGORY_SLUGS) {
      const hub = CATEGORY_HUBS[slug];
      expect(hub.emoji).toBeTruthy();
      expect(hub.hero.length).toBeGreaterThan(20);
      expect(hub.description.length).toBeGreaterThan(20);
    }
  });

  it("youth 는 ageTags=청년 + 교육·취업 benefitTags 보유", () => {
    const youth = CATEGORY_HUBS.youth;
    expect(youth.ageTags).toContain("청년");
    expect(youth.benefitTags).toContain("교육");
    expect(youth.benefitTags).toContain("취업");
  });

  it("business 는 occupationTags 에 소상공인·자영업자 포함", () => {
    const biz = CATEGORY_HUBS.business;
    expect(biz.occupationTags).toContain("소상공인");
    expect(biz.occupationTags).toContain("자영업자");
  });

  it("housing 은 주거 단일 benefit 으로 좁게 매칭", () => {
    const housing = CATEGORY_HUBS.housing;
    expect(housing.benefitTags).toEqual(["주거"]);
  });
});

describe("buildHubOrClause — PostgREST or-clause 빌더", () => {
  // hub-like 테스트 픽스처 (필수 필드만)
  function fakeHub(overrides: Partial<CategoryHub>): CategoryHub {
    return {
      slug: "youth",
      emoji: "🌱",
      label: "테스트",
      shortLabel: "테스트",
      hero: "hero",
      description: "desc",
      benefitTags: [],
      ageTags: [],
      occupationTags: [],
      ...overrides,
    };
  }

  it("3 축 모두 비어있으면 null (over-recall 가드)", () => {
    expect(buildHubOrClause(fakeHub({}))).toBeNull();
  });

  it("benefitTags 만 있을 때 benefit_tags.ov 단일 조건", () => {
    const clause = buildHubOrClause(fakeHub({ benefitTags: ["주거"] }));
    expect(clause).toBe("benefit_tags.ov.{주거}");
  });

  it("세 축 모두 정의된 경우 콤마로 합집합", () => {
    const clause = buildHubOrClause(
      fakeHub({
        benefitTags: ["창업", "금융"],
        ageTags: ["청년"],
        occupationTags: ["소상공인"],
      }),
    );
    expect(clause).toBe(
      "benefit_tags.ov.{창업,금융},age_tags.ov.{청년},occupation_tags.ov.{소상공인}",
    );
  });

  it("실제 housing hub 는 benefit 단일축만", () => {
    expect(buildHubOrClause(CATEGORY_HUBS.housing)).toBe("benefit_tags.ov.{주거}");
  });
});
