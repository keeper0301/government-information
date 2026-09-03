import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateProtectedRedirect,
  evaluatePublicEntry,
  parseArgs,
  runConversionFunnelSmoke,
} from "@/tools/conversion-funnel-smoke.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("conversion-funnel-smoke", () => {
  it("accepts SaaS public entry routes only when they return 200 without redirect", () => {
    expect(evaluatePublicEntry({ path: "/pricing", url: "https://www.keepioo.com/pricing", status: 200, location: "" })).toMatchObject({
      ok: true,
      kind: "public-entry",
    });

    expect(evaluatePublicEntry({ path: "/pricing", url: "https://www.keepioo.com/pricing", status: 302, location: "/login" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("expected_200_no_redirect"),
    });
  });

  it("requires protected funnel routes to preserve the original next path", () => {
    expect(
      evaluateProtectedRedirect(
        {
          path: "/checkout?tier=basic",
          url: "https://www.keepioo.com/checkout?tier=basic",
          status: 307,
          location: "/login?next=%2Fcheckout%3Ftier%3Dbasic",
        },
        "https://www.keepioo.com",
      ),
    ).toMatchObject({
      ok: true,
      kind: "protected-redirect",
      locationPathname: "/login",
      next: "/checkout?tier=basic",
    });

    expect(
      evaluateProtectedRedirect(
        {
          path: "/alerts",
          url: "https://www.keepioo.com/alerts",
          status: 307,
          location: "/login?next=%2Fpricing",
        },
        "https://www.keepioo.com",
      ),
    ).toMatchObject({
      ok: false,
      expectedNext: "/alerts",
      error: expect.stringContaining("expected_login_redirect"),
    });
  });

  it("runs the six route public smoke against fetch with manual redirects", async () => {
    const seen: Array<{ url: string; redirect?: RequestRedirect }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      seen.push({ url, redirect: init?.redirect });
      const path = new URL(url).pathname;
      const search = new URL(url).search;

      if (["/pricing", "/recommend", "/c/business"].includes(path)) {
        return new Response("ok", { status: 200 });
      }

      const next = `${path}${search}`;
      return new Response(null, {
        status: 307,
        headers: { location: `/login?next=${encodeURIComponent(next)}` },
      });
    });

    const report = await runConversionFunnelSmoke({ baseUrl: "https://www.keepioo.com/" });

    expect(report.baseUrl).toBe("https://www.keepioo.com");
    expect(report.total).toBe(6);
    expect(report.passed).toBe(6);
    expect(report.failed).toBe(0);
    expect(seen).toHaveLength(6);
    expect(seen.every((row) => row.redirect === "manual")).toBe(true);
  });

  it("keeps CLI base URL parsing deterministic", () => {
    expect(parseArgs(["--base-url", "https://example.com/", "--json"])).toMatchObject({
      baseUrl: "https://example.com",
      json: true,
    });
  });
});
