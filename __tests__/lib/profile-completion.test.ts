import { describe, expect, it } from "vitest";
import { getProfileCompletionSummary } from "@/lib/personalization/profile-completion";
import type { UserSignals } from "@/lib/personalization/types";

const baseSignals: UserSignals = {
  ageGroup: null,
  region: null,
  district: null,
  occupation: null,
  incomeLevel: null,
  householdTypes: [],
  benefitTags: [],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

describe("getProfileCompletionSummary", () => {
  it("summarizes completed and missing profile fields", () => {
    const summary = getProfileCompletionSummary({
      ...baseSignals,
      ageGroup: "30대",
      region: "전남",
      occupation: "자영업자",
    });

    expect(summary).toEqual({
      completed: 3,
      total: 6,
      percent: 50,
      missingLabels: ["소득", "가구", "관심분야"],
    });
  });

  it("counts child status as household context", () => {
    const summary = getProfileCompletionSummary({
      ...baseSignals,
      hasChildren: false,
    });

    expect(summary.completed).toBe(1);
    expect(summary.missingLabels).not.toContain("가구");
  });
});
