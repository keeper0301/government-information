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

  it("explicitly allows AI search and fetch crawlers for GEO/LLMO", () => {
    const source = read("app/robots.ts");
    for (const bot of [
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-SearchBot",
      "Claude-User",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
    ]) {
      expect(source).toContain(`userAgent: "${bot}"`);
    }
  });

  it("keeps llms.txt aligned with review-mode sitemap reality and AI citation guidance", () => {
    const source = read("public/llms.txt");
    expect(source).toContain("keepioo가 1차 소스로 제공하는 것");
    expect(source).toContain("AdSense 검수 모드에서는 사람이 쓴 가이드·허브 중심으로 제한");
    expect(source).toContain("live ads 모드에서는 복지·대출·뉴스·키워드·블로그 URL까지 복구");
    expect(source).toContain("인용 권장 표기");
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
    for (const path of ["/privacy", "/terms", "/refund", "/help", "/contact", "/about", "/editorial-policy", "/source-policy", "/correction-policy", "/welfare", "/loan", "/blog", "/guides"]) {
      expect(source).toContain("`${baseUrl}" + path);
    }
  });

  it("tightens review-mode sitemap and homepage around editorial guide content", () => {
    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toContain("/welfare·/loan·/blog index 는 대량 목록/자동 생성 인상을 줄 수 있어");
    expect(sitemap).toContain("reviewModeGuideSlugBlock");
    expect(sitemap).toContain("slice(0, 30)");

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

  it("shows a clear eligibility diagnosis demo on review-safe content surfaces", () => {
    const demo = read("components/eligibility-demo-strip.tsx");
    expect(demo).toContain("1분 자격 진단 미리보기");
    expect(demo).toContain("정책알리미는 목록보다 먼저");
    expect(demo).toContain("데모 화면");
    expect(demo).toContain("마감 임박 정책 먼저 표시");
    expect(demo).toContain('ADSENSE_REVIEW_MODE ? "/guides" : "/quiz"');

    const home = read("app/page.tsx");
    expect(home).toContain("<EligibilityDemoStrip />");

    const guides = read("app/guides/page.tsx");
    expect(guides).toContain("<EligibilityDemoStrip compact />");
    expect(guides).toContain("정책을 많이 보여주는 것보다 먼저 거르는 기준");

    const categoryHub = read("app/c/[category]/page.tsx");
    expect(categoryHub).toContain("<EligibilityDemoStrip compact />");
    expect(categoryHub).toContain("접수 종료와 예산 소진 위험");
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
    expect(read("components/home-value-props.tsx")).toContain("REVIEW_MODE_PROPS");
    expect(read("components/home-value-props.tsx")).toContain("공식 출처 확인");
    expect(read("app/help/page.tsx")).toContain("정기적으로 확인해 정리합니다");
    expect(read("app/privacy/page.tsx")).toContain("접속 기록");
    expect(read("app/guides/page.tsx")).toContain("대표 주제별 가이드");
  });

  it("keeps review-mode homepage away from sign-up, search, and floating lead funnels", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("ReviewModeHeroPanel");
    expect(home).toContain('href={ADSENSE_REVIEW_MODE ? "/guides"');
    expect(home).toContain("<SearchBox />");
    expect(home).toContain("!ADSENSE_REVIEW_MODE && <FloatingWishWidget />");
    expect(home).toContain("편집·검수 기준 보기");
    expect(home).not.toContain('href={isLoggedIn ? (isProfileEmpty ? "/mypage" : "/recommend") : "/quiz"}');

    const featureGrid = read("components/feature-grid.tsx");
    expect(featureGrid).toContain("reviewModeFeatures");
    expect(featureGrid).toContain("이렇게 검토해 정리합니다");

    const notFound = read("app/not-found.tsx");
    expect(notFound).toContain("REVIEW_MODE_LINKS");
    expect(notFound).toContain("!ADSENSE_REVIEW_MODE && (");
    expect(notFound).toContain('action="/search"');
  });

  it("keeps review-mode guide, about, category, and metadata surfaces away from SaaS conversion copy", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("ADSENSE_REVIEW_MODE");
    expect(layout).toContain("공공 지원제도 신청 전 확인할 자격·서류·마감 기준");
    expect(layout).toContain("한국의 공공 지원제도 신청 전 확인할 기준");
    expect(layout).toContain("!ADSENSE_REVIEW_MODE && <ChatbotPanel />");

    const guides = read("app/guides/page.tsx");
    expect(guides).toContain('href={ADSENSE_REVIEW_MODE ? "/editorial-policy" : "/quiz"}');
    expect(guides).toContain("신청 전 확인할 기준부터 보세요");
    expect(guides).toContain("편집·검수 기준 보기");

    const about = read("app/about/page.tsx");
    expect(about).toContain("신청 전 확인 순서");
    expect(about).toContain("재심사 기간에는 광고·가입 전환보다 정보 품질을 우선합니다");
    expect(about).toContain('Section title={ADSENSE_REVIEW_MODE ? "운영 기준" : "서비스 운영 비용"}');

    const cohortCta = read("components/cohort-cta-banner.tsx");
    expect(cohortCta).toContain("if (ADSENSE_REVIEW_MODE)");
    expect(cohortCta).toContain("정책은 신청 전 기준부터 확인하세요");
    expect(cohortCta).toContain('href="/guides"');
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
    expect(read("app/editorial-policy/page.tsx")).toContain('alternates: { canonical: "/editorial-policy" }');
    expect(read("app/source-policy/page.tsx")).toContain('alternates: { canonical: "/source-policy" }');
    expect(read("app/correction-policy/page.tsx")).toContain('alternates: { canonical: "/correction-policy" }');
  });

  it("keeps contact and editorial signals visible for AdSense review", () => {
    expect(read("app/contact/page.tsx")).toContain("정책 정보 정정 요청");
    expect(read("app/contact/contact-form.tsx")).toContain("/api/support/submit");
    expect(read("components/footer.tsx")).toContain('href: "/contact"');
    expect(read("components/footer.tsx")).toContain('href: "/editorial-policy"');
    expect(read("components/footer.tsx")).toContain('href: "/source-policy"');
    expect(read("components/footer.tsx")).toContain('href: "/correction-policy"');
    expect(read("app/about/page.tsx")).toContain("편집·검수 기준");
    expect(read("app/editorial-policy/page.tsx")).toContain("수정과 갱신 원칙");
    expect(read("app/source-policy/page.tsx")).toContain("출처 우선순위");
    expect(read("app/correction-policy/page.tsx")).toContain("우선순위와 처리 시간");
    expect(read("app/welfare/page.tsx")).toContain("대상 조건 먼저 확인");
    expect(read("app/loan/page.tsx")).toContain("용도 제한 확인");
  });

  it("exposes deep trust policy pages for AdSense review", () => {
    for (const [path, phrase] of [
      ["app/editorial-policy/page.tsx", "빠른 클릭보다 안전한 확인"],
      ["app/source-policy/page.tsx", "공개 데이터 자료의 처리"],
      ["app/correction-policy/page.tsx", "수정 후 확인"],
    ] as const) {
      const source = read(path);
      expect(source.length).toBeGreaterThan(3500);
      expect(source).toContain(phrase);
      expect(source).toContain("/contact");
    }
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

  it("exposes a live AdSense review preflight CLI with guide-quality summary", () => {
    expect(read("package.json")).toContain('"diagnose:adsense-review"');
    expect(read("package.json")).toContain('"diagnose:adsense-review:status"');
    const source = read("tools/diagnose-adsense-review.mjs");
    expect(source).toContain("Mediapartners-Google");
    expect(source).toContain("DISALLOWED_SITEMAP_PATHS");
    expect(source).toContain("REVIEW_LINK_LEAK_PATHS");
    expect(source).toContain("ADSENSE_REVIEW_STRICT_LINKS");
    expect(source).toContain('{ path: "/welfare", robots: "noindex, follow" }');
    expect(source).toContain('{ path: "/blog", robots: "noindex, follow" }');
    expect(source).toContain('runGuideQualityAudit({ baseUrl: BASE_URL, minGuides: 30 })');
    expect(source).toContain("guide_quality.issues");
    expect(source).toContain("guide quality issues");
  });

  it("exposes a live AdSense review status board generator", () => {
    const source = read("tools/adsense-review-status.mjs");
    expect(source).toContain("AdSense 재심사 추적 보드");
    expect(source).toContain("Manual Site Cron Trigger");
    expect(source).toContain("search-console-sitemap-submit");
    expect(source).toContain("ADSENSE_REVIEW_STRICT_LINKS");
    expect(source).toContain("docs/adsense-review-tracker.md");
  });
});
