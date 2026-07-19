import { describe, expect, it } from "vitest";
import { buildCheckoutQuery, getCheckoutReassuranceCopy } from "@/lib/checkout/reassurance-copy";

describe("buildCheckoutQuery", () => {
  it("preserves pricing conversion context for checkout", () => {
    expect(buildCheckoutQuery({
      tier: "pro",
      source: "notifications",
      recommendedTier: "pro",
      pricingVariant: "notifications_pro_fast_alerts",
    })).toBe("/checkout?tier=pro&source=notifications&recommended=pro&pricing_variant=notifications_pro_fast_alerts");
  });

  it("keeps the default checkout URL compact", () => {
    expect(buildCheckoutQuery({
      tier: "basic",
      source: null,
      recommendedTier: null,
      pricingVariant: "default",
    })).toBe("/checkout?tier=basic");
  });
});

describe("getCheckoutReassuranceCopy", () => {
  it("uses notification-preview Pro reassurance copy", () => {
    const copy = getCheckoutReassuranceCopy({
      tier: "pro",
      searchParams: {
        source: "notifications",
        recommended: "pro",
        pricing_variant: "notifications_pro_fast_alerts",
      },
    });

    expect(copy.title).toContain("카카오 알림톡");
    expect(copy.description).toContain("방금 확인한 알림 조건");
    expect(copy.benefits.join(" ")).toContain("AI 신청서 초안");
  });

  it("uses business-profile Basic reassurance copy", () => {
    const copy = getCheckoutReassuranceCopy({
      tier: "basic",
      searchParams: {
        source: "business",
        recommended: "basic",
        pricing_variant: "business_basic_auto_judgment",
      },
    });

    expect(copy.title).toContain("사장님 조건");
    expect(copy.benefits.join(" ")).toContain("자격 자동 진단");
    expect(copy.benefits.join(" ")).toContain("마감 7일 전 이메일");
  });

  it("falls back to generic Pro copy when variant params are unknown", () => {
    const copy = getCheckoutReassuranceCopy({
      tier: "pro",
      searchParams: { source: "unknown", pricing_variant: "evil" },
    });

    expect(copy.pricingVariant).toBe("default");
    expect(copy.source).toBeNull();
    expect(copy.title).toContain("프로 기능");
  });
});
