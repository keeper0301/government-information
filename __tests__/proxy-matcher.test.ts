import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("does not run the Supabase session proxy for normal public SEO pages", () => {
    expect(config.matcher).toContain("/admin/:path*");
    expect(config.matcher).toContain("/mypage/:path*");
    expect(config.matcher).toContain("/alerts/:path*");
    expect(config.matcher).toContain("/checkout/:path*");
    expect(config.matcher).toContain("/news/:path*");

    const broadPublicMatcher = config.matcher.find(
      (entry) => typeof entry === "string" && entry.includes("((?!_next/static"),
    );
    expect(broadPublicMatcher).toBeUndefined();
  });

  it("keeps referral links covered without matching every public request", () => {
    const refMatcher = config.matcher.find(
      (entry) => typeof entry !== "string" && entry.has?.some((h) => h.type === "query" && h.key === "ref"),
    );
    expect(refMatcher).toBeTruthy();
  });
});
