import { describe, expect, it } from "vitest";
import { isPaidSubscriptionActive } from "@/components/ad-slot";

describe("isPaidSubscriptionActive", () => {
  it("hides ads for active paid subscriptions", () => {
    expect(isPaidSubscriptionActive({ tier: "basic", status: "active" })).toBe(true);
    expect(isPaidSubscriptionActive({ tier: "pro", status: "trialing" })).toBe(true);
  });

  it("shows ads for free, pending, and expired cancelled subscriptions", () => {
    expect(isPaidSubscriptionActive(null)).toBe(false);
    expect(isPaidSubscriptionActive({ tier: "free", status: "active" })).toBe(false);
    expect(isPaidSubscriptionActive({ tier: "basic", status: "pending" })).toBe(false);
    expect(
      isPaidSubscriptionActive({
        tier: "pro",
        status: "cancelled",
        current_period_end: "2000-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("keeps ad removal during a still-paid cancellation period", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(
      isPaidSubscriptionActive({
        tier: "basic",
        status: "cancelled",
        current_period_end: future,
      }),
    ).toBe(true);
  });
});
