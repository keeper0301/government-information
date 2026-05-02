import { describe, expect, it } from "vitest";
import {
  getHomeMatchReasonLabels,
  getHighConfidenceHomeRecommendations,
  getProfileCompletionSummary,
  getRecommendationConfidenceLabel,
  groupHomeRecommendationsByConfidence,
} from "@/components/home-recommend-auto";
import { scoreProgram, type ScorableItem } from "@/lib/personalization/score";
import type { MatchSignal, UserSignals } from "@/lib/personalization/types";

describe("getHomeMatchReasonLabels", () => {
  it("maps scoring signals to compact Korean reason labels", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "income_target", score: 4, detail: "low" },
      { kind: "household_target", score: 3, detail: "single_parent" },
      { kind: "benefit_tags", score: 3, detail: "의료" },
      { kind: "urgent_deadline", score: 1 },
    ];

    expect(getHomeMatchReasonLabels(signals)).toEqual([
      "지역",
      "소득",
      "가구",
      "관심분야",
      "마감임박",
    ]);
  });

  it("deduplicates labels and caps the visible reasons", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "benefit_tags", score: 3, detail: "주거" },
      { kind: "benefit_tags", score: 3, detail: "의료" },
      { kind: "occupation", score: 2 },
      { kind: "age", score: 1 },
    ];

    expect(getHomeMatchReasonLabels(signals)).toEqual([
      "지역",
      "관심분야",
      "직업",
      "연령",
    ]);
    expect(getHomeMatchReasonLabels(signals, 2)).toEqual([
      "지역",
      "관심분야",
    ]);
    expect(getHomeMatchReasonLabels(signals, 0)).toEqual([]);
  });
});

describe("getProfileCompletionSummary", () => {
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

  it("summarizes missing profile fields for homepage trust UI", () => {
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

describe("getRecommendationConfidenceLabel", () => {
  it("labels recommendations by amount of matching evidence", () => {
    expect(
      getRecommendationConfidenceLabel([
        { kind: "region", score: 5 },
        { kind: "district", score: 5 },
        { kind: "income_target", score: 4 },
        { kind: "household_target", score: 3 },
        { kind: "benefit_tags", score: 3 },
      ]),
    ).toBe("매우 적합");

    expect(
      getRecommendationConfidenceLabel([
        { kind: "region", score: 5 },
        { kind: "occupation", score: 2 },
      ]),
    ).toBe("적합");

    expect(
      getRecommendationConfidenceLabel([
        { kind: "region", score: 5 },
        { kind: "benefit_tags", score: 3 },
        { kind: "age", score: 1 },
      ]),
    ).toBe("확인 필요");

    expect(getRecommendationConfidenceLabel([{ kind: "region", score: 5 }])).toBe(
      "확인 필요",
    );
  });
});

describe("groupHomeRecommendationsByConfidence", () => {
  it("separates strong recommendations from items that need source confirmation", () => {
    const strong = {
      item: { id: "strong" },
      signals: [
        { kind: "region", score: 5 },
        { kind: "income_target", score: 4 },
      ] satisfies MatchSignal[],
    };
    const weakInterestMatch = {
      item: { id: "weak-interest" },
      signals: [
        { kind: "region", score: 5 },
        { kind: "benefit_tags", score: 3 },
        { kind: "age", score: 1 },
      ] satisfies MatchSignal[],
    };
    const needsReview = {
      item: { id: "review" },
      signals: [{ kind: "region", score: 5 }] satisfies MatchSignal[],
    };

    expect(groupHomeRecommendationsByConfidence([strong, weakInterestMatch, needsReview])).toEqual({
      likely: [strong],
      needsReview: [weakInterestMatch, needsReview],
    });
  });
});

describe("getHighConfidenceHomeRecommendations", () => {
  it("keeps weak profile matches out of the homepage preview", () => {
    const strong = {
      item: { id: "strong" },
      signals: [
        { kind: "region", score: 5 },
        { kind: "income_target", score: 4 },
      ] satisfies MatchSignal[],
    };
    const needsReview = {
      item: { id: "needs-review" },
      signals: [
        { kind: "region", score: 5 },
        { kind: "benefit_tags", score: 3 },
        { kind: "age", score: 1 },
      ] satisfies MatchSignal[],
    };

    expect(getHighConfidenceHomeRecommendations([needsReview])).toEqual([]);
    expect(getHighConfidenceHomeRecommendations([needsReview, strong])).toEqual([
      strong,
    ]);
    expect(getHighConfidenceHomeRecommendations([strong, { ...strong, item: { id: "second" } }], 1)).toEqual([
      strong,
    ]);
  });
});

describe("homepage personalized preview scoring safety", () => {
  it("does not let income-mismatched policies pass by interest tags alone", () => {
    const user: UserSignals = {
      ageGroup: null,
      region: null,
      district: null,
      occupation: null,
      incomeLevel: "high",
      householdTypes: [],
      benefitTags: ["의료"] as UserSignals["benefitTags"],
      hasChildren: null,
      merit: null,
      businessProfile: null,
    };
    const item: ScorableItem = {
      id: "medical-aid",
      title: "의료급여(요양비)",
      description: "의료급여 수급권자에게 의료비를 지원합니다.",
      region: null,
      benefit_tags: ["의료"],
      source: "보건복지부",
      apply_end: null,
      income_target_level: null,
      household_target_tags: [],
    };

    expect(scoreProgram(item, user).score).toBe(0);
  });
});
