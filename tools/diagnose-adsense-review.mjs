#!/usr/bin/env node
// ============================================================
// AdSense 재심사 preflight — live public surface read-only 진단
// ============================================================

const BASE_URL = process.env.ADSENSE_REVIEW_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
const USER_AGENT = "keepioo-adsense-review-preflight/1.0";
const DISALLOWED_SITEMAP_PATHS = [
  "/news",
  "/blog",
  "/welfare",
  "/loan",
  "/calendar",
  "/recommend",
  "/popular",
  "/consult",
  "/alerts",
  "/pricing",
  "/eligibility",
];
const REVIEW_LINK_LEAK_PATHS = [
  "/news",
  "/blog",
  "/welfare",
  "/loan",
  "/calendar",
  "/recommend",
  "/popular",
  "/consult",
  "/alerts",
  "/pricing",
  "/eligibility",
  "/search",
  "/compare",
];
const RISKY_PHRASES = [
  "자동 수집",
  "매일 14편",
  "최근 정책 소식",
  "진행 중 지원 공고",
  "대량 상세 목록",
  "블로그 카테고리",
];
const STRICT_LINKS = process.env.ADSENSE_REVIEW_STRICT_LINKS === "1";
const PAGE_CHECKS = [
  { path: "/", robots: "index, follow", required: ["신청 판단", "대표 가이드"] },
  { path: "/about", robots: "index, follow", required: ["공식 출처", "대표 가이드", "편집·검수 기준"] },
  { path: "/guides", robots: "index, follow", required: ["대표 주제별 가이드"] },
  { path: "/help", robots: "index, follow", required: ["정기적으로 확인"] },
  { path: "/welfare", robots: "noindex, follow" },
  { path: "/loan", robots: "noindex, follow" },
  { path: "/blog", robots: "noindex, follow" },
  { path: "/news", robots: "noindex, follow" },
  { path: "/privacy", robots: "index, follow", required: ["접속 기록"] },
  { path: "/terms", robots: "index, follow" },
  { path: "/contact", robots: "index, follow" },
  { path: "/c/youth", robots: "index, follow" },
  { path: "/c/senior", robots: "index, follow" },
  { path: "/c/business", robots: "index, follow" },
  { path: "/c/housing", robots: "index, follow" },
];

async function fetchText(path) {
  const url = new URL(path, BASE_URL).toString();
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  const text = await response.text();
  return { url, status: response.status, text };
}

function extractRobots(html) {
  const match = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ?? "";
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInternalLinks(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((href) => href.startsWith("/"));
}

const failures = [];
const lines = [];

const sitemap = await fetchText("/sitemap.xml");
if (sitemap.status !== 200) failures.push(`sitemap HTTP ${sitemap.status}`);
const locs = [...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
lines.push(`sitemap.loc_count=${locs.length}`);
for (const path of DISALLOWED_SITEMAP_PATHS) {
  const count = locs.filter((url) => new URL(url).pathname.startsWith(path)).length;
  lines.push(`sitemap.${path}=${count}`);
  if (count !== 0) failures.push(`sitemap includes ${path}: ${count}`);
}
lines.push(`sitemap./guides=${locs.filter((url) => new URL(url).pathname.startsWith("/guides")).length}`);
lines.push(`sitemap./c=${locs.filter((url) => new URL(url).pathname.startsWith("/c/")).length}`);

const robots = await fetchText("/robots.txt");
if (robots.status !== 200) failures.push(`robots.txt HTTP ${robots.status}`);
if (!robots.text.includes("Mediapartners-Google")) failures.push("robots.txt missing Mediapartners-Google");
lines.push(`robots.mediapartners=${robots.text.includes("Mediapartners-Google") ? "ok" : "missing"}`);

for (const check of PAGE_CHECKS) {
  const page = await fetchText(check.path);
  const text = stripHtml(page.text);
  const robotsMeta = extractRobots(page.text);
  lines.push(`${check.path}.http=${page.status}`);
  lines.push(`${check.path}.robots=${robotsMeta || "missing"}`);
  if (page.status !== 200) failures.push(`${check.path} HTTP ${page.status}`);
  if (check.robots && robotsMeta !== check.robots) failures.push(`${check.path} robots expected ${check.robots}, got ${robotsMeta || "missing"}`);
  for (const phrase of RISKY_PHRASES) {
    if (text.includes(phrase)) failures.push(`${check.path} risky phrase: ${phrase}`);
  }
  const links = extractInternalLinks(page.text);
  for (const leakPath of REVIEW_LINK_LEAK_PATHS) {
    const count = links.filter((href) => href === leakPath || href.startsWith(`${leakPath}/`) || href.startsWith(`${leakPath}?`)).length;
    lines.push(`${check.path}.links.${leakPath}=${count}`);
    if (STRICT_LINKS && count > 0 && ["/", "/help", "/c/youth", "/c/senior", "/c/business", "/c/housing"].includes(check.path)) {
      failures.push(`${check.path} review link leak ${leakPath}: ${count}`);
    }
  }
  for (const required of check.required ?? []) {
    if (!text.includes(required)) failures.push(`${check.path} missing required phrase: ${required}`);
  }
}

console.log("AdSense review preflight");
console.log(`base=${BASE_URL}`);
for (const line of lines) console.log(line);
if (failures.length > 0) {
  console.log("status=fail");
  for (const failure of failures) console.log(`FAIL ${failure}`);
  process.exit(1);
}
console.log("status=ok");
