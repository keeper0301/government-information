import { describe, expect, it } from "vitest";
import { getPricingConversionCopy, parsePricingSource } from "@/lib/pricing/conversion-copy";

describe("parsePricingSource", () => {
  it("allows known conversion sources", () => {
    expect(parsePricingSource({ from: "notifications" })).toBe("notifications");
    expect(parsePricingSource({ from: "business" })).toBe("business");
  });

  it("uses the first value when source is an array", () => {
    expect(parsePricingSource({ from: ["business", "notifications"] })).toBe("business");
  });

  it("rejects unknown or missing sources", () => {
    expect(parsePricingSource({ from: "unknown" })).toBeNull();
    expect(parsePricingSource({})).toBeNull();
    expect(parsePricingSource(null)).toBeNull();
  });
});

describe("getPricingConversionCopy", () => {
  it("uses a stronger Pro conversion variant for notification preview traffic", () => {
    const copy = getPricingConversionCopy({ source: "notifications", recommendedTier: "pro" });

    expect(copy.variant).toBe("notifications_pro_fast_alerts");
    expect(copy.heading).toContain("카카오");
    expect(copy.planNudgeByTier.pro).toContain("방금 본 알림 조건");
    expect(copy.ctaLabelByTier.pro).toContain("카카오 알림톡");
  });

  it("uses a Basic conversion variant for business-profile traffic", () => {
    const copy = getPricingConversionCopy({ source: "business", recommendedTier: "basic" });

    expect(copy.variant).toBe("business_basic_auto_judgment");
    expect(copy.heading).toContain("내 가게");
    expect(copy.planNudgeByTier.basic).toContain("사장님 자격 진단");
  });

  it("keeps the default copy for unrelated traffic", () => {
    const copy = getPricingConversionCopy({ source: "notifications", recommendedTier: "basic" });

    expect(copy.variant).toBe("default");
    expect(copy.heading).toBe("나에게 맞는 요금제를 골라보세요");
    expect(copy.planNudgeByTier.pro).toBeUndefined();
  });
});
