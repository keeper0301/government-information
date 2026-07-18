import { describe, expect, it } from "vitest";
import { parseRecommendedTier } from "@/lib/pricing/recommended-tier";

describe("parseRecommendedTier", () => {
  it("basic/pro 추천 티어만 허용한다", () => {
    expect(parseRecommendedTier({ recommended: "basic" })).toBe("basic");
    expect(parseRecommendedTier({ recommended: "pro" })).toBe("pro");
  });

  it("배열이면 첫 번째 값만 사용한다", () => {
    expect(parseRecommendedTier({ recommended: ["pro", "basic"] })).toBe("pro");
  });

  it("free/unknown/empty 값은 추천 강조하지 않는다", () => {
    expect(parseRecommendedTier({ recommended: "free" })).toBeNull();
    expect(parseRecommendedTier({ recommended: "enterprise" })).toBeNull();
    expect(parseRecommendedTier({})).toBeNull();
    expect(parseRecommendedTier(null)).toBeNull();
  });
});
