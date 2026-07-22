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
      expect(source).toContain("reviewModeNoindexRobots()");
    }
    expect(read("app/onboarding/page.tsx")).toContain(
      "reviewModeNoindexRobots({ follow: false })",
    );
  });

  it("keeps review-mode AdSense script off non-content helper routes", () => {
    const source = read("components/adsense-lazy-loader.tsx");

    for (const path of ["/about", "/help", "/contact", "/welfare", "/loan", "/blog", "/guides"]) {
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

  it("keeps legacy approved-after-review env from disabling review mode after rejection", () => {
    const source = read("lib/adsense-review-mode.ts");
    expect(source).toContain('ADSENSE_LIVE_ADS_TOKEN = "adsense-approved-live-ads"');
    expect(source).toContain("ADSENSE_REVIEW_MODE");
    expect(source).not.toContain('!== "approved-after-review"');
  });

  it("keeps noindex helper pages out of review-mode sitemap but leaves an approval restore path", () => {
    const source = read("app/sitemap.ts");
    expect(source).toContain("!ADSENSE_REVIEW_MODE");
    for (const path of ["/calendar", "/recommend", "/popular", "/consult", "/alerts", "/pricing"]) {
      expect(source).toContain("`${baseUrl}" + path);
    }
    for (const path of ["/privacy", "/terms", "/refund", "/help", "/contact", "/about", "/welfare", "/loan", "/blog", "/guides"]) {
      expect(source).toContain("`${baseUrl}" + path);
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
    expect(read("app/contact/page.tsx")).toContain('alternates: { canonical: "/contact" }');
  });

  it("keeps contact and editorial signals visible for AdSense review", () => {
    expect(read("app/contact/page.tsx")).toContain("정책 정보 정정 요청");
    expect(read("app/contact/contact-form.tsx")).toContain("/api/support/submit");
    expect(read("components/footer.tsx")).toContain('href: "/contact"');
    expect(read("app/about/page.tsx")).toContain("편집·검수 기준");
    expect(read("app/welfare/page.tsx")).toContain("대상 조건 먼저 확인");
    expect(read("app/loan/page.tsx")).toContain("용도 제한 확인");
  });
});
