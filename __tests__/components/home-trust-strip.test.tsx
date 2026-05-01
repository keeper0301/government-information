import { describe, expect, it } from "vitest";
import { buildFreshnessLabel } from "@/components/home-trust-strip";

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
