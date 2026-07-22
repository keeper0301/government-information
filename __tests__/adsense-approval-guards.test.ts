import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("AdSense approval guardrails", () => {
  it("marks utility, commerce, and personalization pages noindex so review focuses on content pages", () => {
    for (const path of [
      "app/search/page.tsx",
      "app/compare/page.tsx",
      "app/pricing/page.tsx",
      "app/consult/layout.tsx",
      "app/recommend/page.tsx",
      "app/policy/page.tsx",
      "app/popular/page.tsx",
      "app/calendar/page.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("robots: { index: false, follow: true }");
    }
    expect(read("app/onboarding/page.tsx")).toContain(
      "robots: { index: false, follow: false }",
    );
  });

  it("keeps review-mode AdSense script off non-content helper routes", () => {
    const source = read("components/adsense-lazy-loader.tsx");

    for (const path of ["/about", "/help", "/welfare", "/loan", "/blog", "/guides"]) {
      expect(source).toContain(`"${path}"`);
    }
    for (const path of ["/search", "/compare", "/pricing", "/consult"]) {
      expect(source).not.toContain(`"${path}"`);
    }
    expect(source).toContain("shouldLoadAdsenseScript(window.location.pathname)");
  });

  it("disallows crawl traps and account routes from robots.txt", () => {
    const source = read("app/robots.ts");
    for (const path of [
      "/admin/",
      "/signup",
      "/checkout",
      "/mypage",
      "/search",
      "/compare",
    ]) {
      expect(source).toContain(`"${path}"`);
    }
  });

  it("uses the www canonical host for default metadata and schema urls", () => {
    const source = read("app/layout.tsx");
    expect(source).toContain('"https://www.keepioo.com"');
    expect(source).not.toContain('"https://keepioo.com"');
  });

  it("sets explicit canonicals on legal and trust pages", () => {
    expect(read("app/privacy/page.tsx")).toContain('alternates: { canonical: "/privacy" }');
    expect(read("app/terms/page.tsx")).toContain('alternates: { canonical: "/terms" }');
    expect(read("app/refund/page.tsx")).toContain('alternates: { canonical: "/refund" }');
  });
});
