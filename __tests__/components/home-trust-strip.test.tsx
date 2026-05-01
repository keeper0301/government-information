import { describe, expect, it } from "vitest";
import {
  buildFreshnessLabel,
  buildTrustStripData,
} from "@/components/home-trust-strip";

describe("buildFreshnessLabel", () => {
  it("uses a fallback when freshness is unavailable", () => {
    expect(buildFreshnessLabel(null)).toBe("수집 상태 확인 중");
  });

  it("formats recent freshness in minutes", () => {
    expect(buildFreshnessLabel(12)).toBe("12분 전 업데이트");
  });

  it("formats older freshness in hours", () => {
    expect(buildFreshnessLabel(180)).toBe("3시간 전 업데이트");
  });
});

describe("buildTrustStripData", () => {
  it("falls back when freshness loading rejects", () => {
    const data = buildTrustStripData(
      {
        status: "fulfilled",
        value: {
          news_total: 10,
          welfare_total: 20,
          loan_total: 30,
          today_new_welfare: 2,
          today_new_loan: 3,
          week_new_welfare: 11,
          week_new_loan: 7,
        },
      },
      {
        status: "rejected",
        reason: new Error("freshness failed"),
      },
    );

    expect(data).toEqual({
      todayNew: 5,
      weekNew: 18,
      freshnessLabel: "수집 상태 확인 중",
    });
  });
});
