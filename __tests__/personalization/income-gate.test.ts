import { describe, expect, it } from "vitest";
import { scoreProgram, type ScorableItem } from "@/lib/personalization/score";
import type { UserSignals } from "@/lib/personalization/types";

const highIncomeUser: UserSignals = {
  ageGroup: null,
  region: null,
  district: null,
  occupation: null,
  incomeLevel: "high",
  householdTypes: [],
  benefitTags: ["의료", "생계", "주거"] as UserSignals["benefitTags"],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

function program(overrides: Partial<ScorableItem>): ScorableItem {
  return {
    id: "program-1",
    title: "일반 복지 지원",
    description: "생활 안정을 위한 지원",
    region: null,
    benefit_tags: ["의료", "생계", "주거"],
    apply_end: null,
    source: "보건복지부",
    income_target_level: null,
    household_target_tags: null,
    ...overrides,
  };
}

describe("income gate", () => {
  it("blocks explicit low-income targets when the user entered a higher income level", () => {
    const result = scoreProgram(
      program({
        title: "저소득층 의료비 지원",
        income_target_level: "low",
      }),
      highIncomeUser,
    );

    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });

  it("blocks medical-aid recipient programs when the user entered a higher income level", () => {
    const result = scoreProgram(
      program({
        title: "의료급여(요양비)",
        description: "의료급여 수급권자에게 의료비를 지원합니다.",
      }),
      highIncomeUser,
    );

    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });
});
