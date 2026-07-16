import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("keeps protected paths and selected public cache-header paths covered without restoring the broad public catch-all", () => {
    expect(config.matcher).toContain("/help");
    expect(config.matcher).toContain("/guides");
    expect(config.matcher).toContain("/login");
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
