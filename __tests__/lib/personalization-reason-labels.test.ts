import { describe, expect, it } from "vitest";
import {
  getMatchReasonLabels,
  getRecommendationConfidenceLabel,
} from "@/lib/personalization/reason-labels";
import type { MatchSignal } from "@/lib/personalization/types";

describe("getMatchReasonLabels", () => {
  it("maps scoring signals to reusable Korean reason labels", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "sub_district", score: 10 },
      { kind: "income_target", score: 4 },
      { kind: "household_target", score: 3 },
      { kind: "benefit_tags", score: 3 },
      { kind: "urgent_deadline", score: 1 },
      { kind: "popularity", score: 2 },
    ];

    expect(getMatchReasonLabels(signals, { limit: 8 })).toEqual([
      "지역",
      "시군구",
      "읍면동",
      "소득",
      "가구",
      "관심",
      "마감",
      "인기",
    ]);
  });

  it("supports surface-specific label overrides while deduplicating", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "benefit_tags", score: 3 },
      { kind: "benefit_tags", score: 2 },
    ];

    expect(
      getMatchReasonLabels(signals, {
        limit: 5,
        labels: {
          district: "지역",
          benefit_tags: "관심분야",
        },
      }),
    ).toEqual(["지역", "관심분야"]);
  });

  it("keeps recommendation confidence language reusable", () => {
    expect(
      getRecommendationConfidenceLabel([
        { kind: "region", score: 5 },
        { kind: "income_target", score: 4 },
      ]),
    ).toBe("적합");

    expect(
      getRecommendationConfidenceLabel([{ kind: "region", score: 5 }]),
    ).toBe("확인 필요");
  });
});
