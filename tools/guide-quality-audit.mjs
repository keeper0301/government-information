#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.keepioo.com";
const DEFAULT_MIN_GUIDES = 18;

export const GUIDE_QUALITY_CHECKS = [
  {
    key: "official_source",
    label: "공식 출처/문의처",
    keywords: ["공식", "원문", "문의처", "담당", "기관", "정부24", "복지로", "주민센터", "보건소"],
  },
  {
    key: "before_apply",
    label: "신청 전 확인",
    keywords: ["신청 전", "먼저", "확인", "점검", "준비"],
  },
  {
    key: "eligibility",
    label: "자격/대상 기준",
    keywords: ["자격", "대상", "소득", "재산", "거주", "나이", "기준"],
  },
  {
    key: "documents",
    label: "서류/증빙",
    keywords: ["서류", "증빙", "등본", "계약서", "영수증", "증명서", "자료"],
  },
  {
    key: "deadline",
    label: "마감/기간/예산",
    keywords: ["마감", "기간", "예산", "접수", "종료", "시점"],
  },
  {
    key: "duplicate_limits",
    label: "중복/제외/제한",
    keywords: ["중복", "제외", "제한", "환수", "취소", "기수혜", "유사 사업"],
  },
];

export function parseArgs(argv) {
  const out = {
    baseUrl: process.env.GUIDE_QUALITY_BASE_URL || DEFAULT_BASE_URL,
    minGuides: Number(process.env.GUIDE_QUALITY_MIN_GUIDES || DEFAULT_MIN_GUIDES),
    json: false,
    failOnIssues: process.env.GUIDE_QUALITY_FAIL_ON_ISSUES === "1",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--min-guides") out.minGuides = Number(argv[++i]);
    else if (arg === "--json") out.json = true;
    else if (arg === "--fail-on-issues") out.failOnIssues = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }

  out.baseUrl = String(out.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  if (!Number.isFinite(out.minGuides) || out.minGuides < 1) out.minGuides = DEFAULT_MIN_GUIDES;
  return out;
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSitemapGuideUrls(xml, baseUrl = DEFAULT_BASE_URL) {
  const origin = new URL(baseUrl).origin;
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.origin === origin && (parsed.pathname === "/guides" || parsed.pathname.startsWith("/guides/"));
      } catch {
        return false;
      }
    })
    .sort();
}

function titleFromHtml(html, fallbackUrl) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return stripHtml(h1);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) return stripHtml(title).replace(/\s*[—|-]\s*.*$/, "");
  return new URL(fallbackUrl).pathname.split("/").filter(Boolean).pop() || fallbackUrl;
}

export function analyzeGuideHtml(html, url, options = {}) {
  const text = stripHtml(html);
  const title = options.title || titleFromHtml(html, url);
  const checks = GUIDE_QUALITY_CHECKS.map((check) => {
    const matched = check.keywords.filter((keyword) => text.includes(keyword));
    return {
      key: check.key,
      label: check.label,
      ok: matched.length > 0,
      matched,
    };
  });
  const missing = checks.filter((check) => !check.ok).map((check) => check.key);
  return {
    url,
    path: new URL(url).pathname,
    title,
    textLength: text.length,
    checks,
    missing,
    ok: missing.length === 0,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "keepioo-guide-quality-audit/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return {
    url,
    status: response.status,
    text: await response.text(),
  };
}

export async function runGuideQualityAudit(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const minGuides = options.minGuides || DEFAULT_MIN_GUIDES;
  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`);
  const failures = [];
  if (sitemap.status !== 200) failures.push(`sitemap HTTP ${sitemap.status}`);

  const guideUrls = parseSitemapGuideUrls(sitemap.text, baseUrl);
  if (guideUrls.length < minGuides) failures.push(`guide_count_below_min:${guideUrls.length}<${minGuides}`);

  const results = [];
  for (const url of guideUrls) {
    try {
      const page = await fetchText(url);
      if (page.status !== 200) {
        failures.push(`${new URL(url).pathname} HTTP ${page.status}`);
        results.push({ url, path: new URL(url).pathname, title: "", textLength: 0, checks: [], missing: GUIDE_QUALITY_CHECKS.map((c) => c.key), ok: false, status: page.status });
        continue;
      }
      results.push({ ...analyzeGuideHtml(page.text, url), status: page.status });
    } catch (error) {
      failures.push(`${new URL(url).pathname} fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ url, path: new URL(url).pathname, title: "", textLength: 0, checks: [], missing: GUIDE_QUALITY_CHECKS.map((c) => c.key), ok: false, status: 0 });
    }
  }

  const issueRows = results.filter((row) => row.missing.length > 0);
  const missingCounts = Object.fromEntries(GUIDE_QUALITY_CHECKS.map((check) => [
    check.key,
    issueRows.filter((row) => row.missing.includes(check.key)).length,
  ]));

  return {
    baseUrl,
    checkedAt: new Date().toISOString(),
    minGuides,
    guideCount: guideUrls.length,
    fetched: results.length,
    passed: results.filter((row) => row.ok).length,
    issueCount: issueRows.length,
    missingCounts,
    failures,
    status: failures.length === 0 ? "ok" : "fail",
    results,
  };
}

function printHuman(report) {
  console.log(`Guide quality audit: ${report.baseUrl} @ ${report.checkedAt}`);
  console.log(`guides=${report.guideCount} fetched=${report.fetched} passed=${report.passed} issues=${report.issueCount}`);
  for (const [key, count] of Object.entries(report.missingCounts)) {
    console.log(`missing.${key}=${count}`);
  }
  const issueRows = report.results.filter((row) => row.missing.length > 0).slice(0, 10);
  for (const row of issueRows) {
    console.log(`ISSUE ${row.path} title="${row.title}" missing=${row.missing.join("|")}`);
  }
  for (const failure of report.failures) console.log(`FAIL ${failure}`);
  console.log(`status=${report.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tools/guide-quality-audit.mjs [--base-url https://www.keepioo.com] [--min-guides 18] [--fail-on-issues] [--json]");
    process.exit(0);
  }

  const report = await runGuideQualityAudit(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  const hasIssueFailure = args.failOnIssues && report.issueCount > 0;
  process.exit(report.status === "ok" && !hasIssueFailure ? 0 : 1);
}
