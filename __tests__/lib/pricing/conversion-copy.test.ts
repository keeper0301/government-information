import { describe, expect, it } from "vitest";
import { getPricingConversionCopy, parsePricingSource } from "@/lib/pricing/conversion-copy";

describe("parsePricingSource", () => {
  it("allows known conversion sources", () => {
    expect(parsePricingSource({ from: "notifications" })).toBe("notifications");
    expect(parsePricingSource({ from: "business" })).toBe("business");
    expect(parsePricingSource({ from: "instagram" })).toBe("instagram");
    expect(parsePricingSource({ from: "threads" })).toBe("threads");
    expect(parsePricingSource({ from: "seo" })).toBe("seo");
    expect(parsePricingSource({ from: "naver" })).toBe("naver");
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
    expect(copy.heading).toBe("사장님 정책 마감, 놓치지 않게 챙겨드릴게요");
    expect(copy.planNudgeByTier.basic).toContain("마감 7일 전 이메일");
    expect(copy.ctaLabelByTier.basic).toBe("내 정책 알림 시작하기");
  });
});
