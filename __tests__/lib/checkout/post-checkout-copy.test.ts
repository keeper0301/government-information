import { describe, expect, it } from "vitest";
import { getCheckoutRetryHref, getPostCheckoutActivationCopy } from "@/lib/checkout/post-checkout-copy";

describe("getPostCheckoutActivationCopy", () => {
  it("routes Basic users to business profile and email alert setup", () => {
    const copy = getPostCheckoutActivationCopy("basic");

    expect(copy.title).toContain("베이직");
    expect(copy.description).toContain("사업자 정보");
    expect(copy.actions.map((action) => action.href)).toEqual([
      "/mypage/business",
      "/mypage/notifications",
    ]);
  });

  it("routes Pro users to Kakao consent and notification setup", () => {
    const copy = getPostCheckoutActivationCopy("pro");

    expect(copy.title).toContain("프로");
    expect(copy.description).toContain("카카오 알림톡");
    expect(copy.actions.map((action) => action.href)).toEqual([
      "/mypage#consents",
      "/mypage/notifications",
    ]);
  });
});

describe("getCheckoutRetryHref", () => {
  it("returns a direct checkout retry for supported paid tiers", () => {
    expect(getCheckoutRetryHref("basic")).toBe("/checkout?tier=basic");
    expect(getCheckoutRetryHref("pro")).toBe("/checkout?tier=pro");
  });

  it("falls back to pricing for unknown tiers", () => {
    expect(getCheckoutRetryHref("free")).toBe("/pricing");
    expect(getCheckoutRetryHref("evil")).toBe("/pricing");
    expect(getCheckoutRetryHref(undefined)).toBe("/pricing");
  });
});
