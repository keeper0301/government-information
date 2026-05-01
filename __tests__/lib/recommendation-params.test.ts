import { describe, expect, it } from "vitest";

import { buildRecommendationParamsFromSignals } from "@/lib/recommendation-params";
import type { UserSignals } from "@/lib/personalization/types";

const signals: UserSignals = {
  ageGroup: "30대",
  region: "전남",
  district: "순천시",
  occupation: "직장인",
  incomeLevel: "mid_high",
  householdTypes: ["married"],
  benefitTags: ["주거"],
  hasChildren: false,
  merit: "none",
  businessProfile: {
    industry: "other",
    revenue_scale: "under_50m",
    employee_count: "none",
    business_type: "sole_proprietor",
    established_date: null,
    region: "전남",
    district: "순천시",
  },
};

describe("buildRecommendationParamsFromSignals", () => {
  it("keeps all mypage targeting fields when building recommendation params", () => {
    expect(
      buildRecommendationParamsFromSignals(signals, { programType: "all" }),
    ).toEqual({
      ageGroup: "30대",
      region: "전남",
      district: "순천시",
      occupation: "직장인",
      incomeLevel: "mid_high",
      householdTypes: ["married"],
      benefitTags: ["주거"],
      hasChildren: false,
      merit: "none",
      businessProfile: signals.businessProfile,
      programType: "all",
    });
  });

  it("returns null until the required recommendation fields are present", () => {
    expect(
      buildRecommendationParamsFromSignals({ ...signals, occupation: null }),
    ).toBeNull();
  });
});
