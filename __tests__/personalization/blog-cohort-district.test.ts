import { describe, expect, it } from "vitest";
import {
  isBlogCohortFit,
  type CohortUserSignals,
} from "@/lib/personalization/blog-cohort";

const suncheonOwner: CohortUserSignals = {
  ageGroup: "30대",
  region: "전남",
  district: "순천시",
  occupation: "자영업자",
  incomeLevel: null,
  householdTypes: [],
  benefitTags: ["창업", "금융", "생계", "의료"],
  hasChildren: null,
  merit: null,
};

describe("blog cohort district filter", () => {
  it("blocks a Gokseong guide for a Suncheon user", () => {
    const post = {
      category: "소상공인",
      title: "2026년 곡성군 자활기금 저소득층 창업·운영 자금 융자로 자립 지원받으세요!",
      meta_description:
        "전라남도 곡성군의 자활기금은 저소득층의 성공적인 사회 진출을 돕기 위해 창업 및 사업 운영에 필요한 자금을 지원합니다.",
      tags: ["전라남도", "곡성군", "소상공인"],
    };

    expect(isBlogCohortFit(post, suncheonOwner)).toBe(false);
  });

  it("keeps a Suncheon guide for a Suncheon user", () => {
    const post = {
      category: "소상공인",
      title: "2026년 순천시 소상공인 경영안정자금 신청 가이드",
      meta_description:
        "전라남도 순천시에서 사업장을 운영하는 소상공인을 위한 경영안정자금 안내입니다.",
      tags: ["전라남도", "순천시", "소상공인"],
    };

    expect(isBlogCohortFit(post, suncheonOwner)).toBe(true);
  });
});
