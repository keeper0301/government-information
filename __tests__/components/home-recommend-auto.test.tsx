import { describe, expect, it } from "vitest";
import { getHomeMatchReasonLabels } from "@/components/home-recommend-auto";
import type { MatchSignal } from "@/lib/personalization/types";

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
  });
});
