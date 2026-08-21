import { describe, expect, it } from "vitest";
import { buildBasicPricingHref, buildProPricingHref } from "@/lib/pricing/cta-links";

describe("pricing CTA links", () => {
  it("routes homepage/social/SEO traffic to the Basic pricing funnel", () => {
    expect(buildBasicPricingHref("home")).toBe("/pricing?from=home&recommended=basic");
    expect(buildBasicPricingHref("instagram")).toBe("/pricing?from=instagram&recommended=basic");
    expect(buildBasicPricingHref("threads")).toBe("/pricing?from=threads&recommended=basic");
    expect(buildBasicPricingHref("seo")).toBe("/pricing?from=seo&recommended=basic");
    expect(buildBasicPricingHref("naver")).toBe("/pricing?from=naver&recommended=basic");
  });

  it("keeps the Pro helper explicit for upgrade-only surfaces", () => {
    expect(buildProPricingHref("notifications")).toBe("/pricing?from=notifications&recommended=pro");
  });
});
