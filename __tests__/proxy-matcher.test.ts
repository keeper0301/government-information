import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

describe("proxy matcher", () => {
  it("keeps protected paths covered without restoring public page proxy matchers", () => {
    expect(config.matcher).not.toContain("/help");
    expect(config.matcher).not.toContain("/guides");
    expect(config.matcher).not.toContain("/login");
    expect(config.matcher).toContain("/api/admin/bootstrap-search-console-env");
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

  it("retired Search Console bootstrap API returns explicit 410 instead of generic app fallback", async () => {
    const response = await proxy(
      new NextRequest("https://www.keepioo.com/api/admin/bootstrap-search-console-env", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: "gone",
      route: "bootstrap-search-console-env retired",
    });
  });
});
