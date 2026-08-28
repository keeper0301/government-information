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

  it("keeps review-mode navigation focused on editorial guides and hubs", () => {
    const nav = read("components/nav.tsx");
    const footer = read("components/footer.tsx");

    expect(nav).toContain("reviewModePolicyChildren");
    expect(nav).toContain('href: ADSENSE_REVIEW_MODE ? "/guides" : "/policy"');
    expect(nav).toContain('label: "가이드", href: "/guides"');
    expect(nav).toContain('label: "문의", href: "/contact"');
    expect(nav).toContain('label: "복지정보", href: "/welfare"');
    expect(nav).toContain('label: "대출정보", href: "/loan"');
    expect(nav).toContain('label: "인기정책", href: "/popular"');
    expect(footer).toContain("const footerLinks = ADSENSE_REVIEW_MODE ?");
    expect(footer).toContain('label: "정책 가이드", href: "/guides"');
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

  it("tightens review-mode sitemap and homepage around editorial guide content", () => {
    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toContain("/welfare·/loan·/blog index 는 대량 목록/자동 생성 인상을 줄 수 있어");
    expect(sitemap).toContain("reviewModeGuideSlugBlock");
    expect(sitemap).toContain("slice(0, 20)");

    const home = read("app/page.tsx");
    expect(home).toContain("ReviewModeHomeBody");
    expect(home).toContain("정책을 많이 모으는 것보다");
    expect(home).toContain("원문 확인용 상세 페이지보다");
    expect(home).toContain("!ADSENSE_REVIEW_MODE && <AdSlot");
    expect(home).toContain("ADSENSE_REVIEW_MODE ? \"/guides\" : \"/welfare\"");
  });

  it("keeps the regional policy map visible during AdSense review mode", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("{ADSENSE_REVIEW_MODE && <ReviewModeHomeBody />}");
    expect(home).toContain("<HomeDiscoveryHub");
    expect(home).toContain("regionMap={<RegionMap />}");
    expect(home).not.toContain("ADSENSE_REVIEW_MODE ? (\n        <ReviewModeHomeBody />");

    const regionMap = read("components/region-map.tsx");
    expect(regionMap).toContain("ADSENSE_REVIEW_MODE ? undefined");
    expect(regionMap).toContain("대표 지역 현황");
  });

  it("routes review-mode home and category hubs away from mass listing pages", () => {
    const targetCards = read("components/home-target-cards.tsx");
    expect(targetCards).toContain("reviewHref");
    expect(targetCards).toContain("ADSENSE_REVIEW_MODE ? t.reviewHref : t.href");
    expect(targetCards).toContain('reviewHref: "/c/business"');

    const categoryHub = read("app/c/[category]/page.tsx");
    expect(categoryHub).toContain("const showPolicyLists = !ADSENSE_REVIEW_MODE");
    expect(categoryHub).toContain("{showPolicyLists && recommended.length > 0");
    expect(categoryHub).toContain("{showPolicyLists && deadlineSoon.length > 0");
    expect(categoryHub).toContain("{!ADSENSE_REVIEW_MODE && blogPosts.length > 0");
    expect(categoryHub).toContain("ADSENSE_REVIEW_MODE ? guides.length");
  });

  it("keeps mass listing indexes noindex during AdSense review mode", () => {
    for (const path of ["app/welfare/page.tsx", "app/loan/page.tsx", "app/blog/page.tsx"]) {
      const source = read(path);
      expect(source).toContain("reviewModeNoindexRobots");
      expect(source).toContain("robots");
    }
  });

  it("removes review-mode low-value and automation-smell phrases from public trust surfaces", () => {
    for (const path of ["app/page.tsx", "app/about/page.tsx", "app/help/page.tsx", "app/privacy/page.tsx", "app/guides/page.tsx"]) {
      const source = read(path);
      expect(source).not.toContain("대량 상세 목록");
    }
    expect(read("components/home-value-props.tsx")).not.toContain("자동 발송");
    expect(read("app/help/page.tsx")).toContain("정기적으로 확인해 정리합니다");
    expect(read("app/privacy/page.tsx")).toContain("접속 기록");
    expect(read("app/guides/page.tsx")).toContain("대표 주제별 가이드");
  });

  it("keeps homepage pricing funnel restorable only after AdSense approval", () => {
    const homeCta = read("components/home-cta.tsx");

    expect(homeCta).toContain("ADSENSE_REVIEW_MODE ? \"/guides\" : buildBasicPricingHref(\"home\")");
    expect(homeCta).toContain("ADSENSE_REVIEW_MODE ? \"/c/business\" : \"/guides\"");
    expect(homeCta).toContain("NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads");

    const reviewMode = read("lib/adsense-review-mode.ts");
    expect(reviewMode).toContain('ADSENSE_LIVE_ADS_TOKEN = "adsense-approved-live-ads"');
    expect(reviewMode).toContain("process.env.NEXT_PUBLIC_ADSENSE_REVIEW_MODE !== ADSENSE_LIVE_ADS_TOKEN");
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

  it("exposes an admin Search Console submission helper for review follow-up", () => {
    expect(read("app/admin/search-console/page.tsx")).toContain(
      "Google Search Console에 sitemap 제출",
    );
    expect(read("app/admin/search-console/page.tsx")).toContain(
      "submitSearchConsoleSitemap",
    );
    expect(read("lib/admin/menu.ts")).toContain("/admin/search-console");
  });

  it("exposes a live AdSense review preflight CLI", () => {
    expect(read("package.json")).toContain('"diagnose:adsense-review"');
    const source = read("tools/diagnose-adsense-review.mjs");
    expect(source).toContain("Mediapartners-Google");
    expect(source).toContain("DISALLOWED_SITEMAP_PATHS");
    expect(source).toContain("REVIEW_LINK_LEAK_PATHS");
    expect(source).toContain("ADSENSE_REVIEW_STRICT_LINKS");
    expect(source).toContain('{ path: "/welfare", robots: "noindex, follow" }');
    expect(source).toContain('{ path: "/blog", robots: "noindex, follow" }');
  });
});
