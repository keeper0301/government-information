#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.keepioo.com";

export const PUBLIC_ENTRY_ROUTES = ["/pricing", "/recommend", "/c/business"];
export const PROTECTED_FUNNEL_ROUTES = [
  "/checkout?tier=basic",
  "/alerts",
  "/mypage/business",
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function expectedNextFor(path) {
  const parsed = new URL(path, "https://keepioo.local");
  return `${parsed.pathname}${parsed.search}`;
}

export function parseArgs(argv) {
  const out = {
    baseUrl: process.env.CONVERSION_FUNNEL_BASE_URL || DEFAULT_BASE_URL,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }

  out.baseUrl = normalizeBaseUrl(out.baseUrl);
  return out;
}

async function fetchRoute(baseUrl, path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": "keepioo-conversion-funnel-smoke/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  return {
    path,
    url,
    status: response.status,
    location: response.headers.get("location") || "",
  };
}

export function evaluatePublicEntry(row) {
  const ok = row.status === 200 && !row.location;
  return {
    ...row,
    kind: "public-entry",
    ok,
    expected: "status 200 without redirect",
    error: ok ? null : `expected_200_no_redirect got status=${row.status} location=${row.location || "-"}`,
  };
}

export function evaluateProtectedRedirect(row, baseUrl) {
  const isRedirect = REDIRECT_STATUSES.has(row.status);
  let locationPathname = "";
  let next = "";
  let parseError = "";

  try {
    const locationUrl = new URL(row.location, baseUrl);
    locationPathname = locationUrl.pathname;
    next = locationUrl.searchParams.get("next") || "";
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const expectedNext = expectedNextFor(row.path);
  const ok = isRedirect && locationPathname === "/login" && next === expectedNext;
  return {
    ...row,
    kind: "protected-redirect",
    ok,
    locationPathname,
    next,
    expectedNext,
    expected: `redirect to /login with next=${expectedNext}`,
    error: ok
      ? null
      : `expected_login_redirect got status=${row.status} location=${row.location || "-"} next=${next || "-"}${parseError ? ` parse_error=${parseError}` : ""}`,
  };
}

export async function runConversionFunnelSmoke(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const publicRoutes = options.publicRoutes || PUBLIC_ENTRY_ROUTES;
  const protectedRoutes = options.protectedRoutes || PROTECTED_FUNNEL_ROUTES;
  const results = [];

  for (const path of publicRoutes) {
    try {
      results.push(evaluatePublicEntry(await fetchRoute(baseUrl, path)));
    } catch (error) {
      results.push({
        path,
        url: `${baseUrl}${path}`,
        status: 0,
        location: "",
        kind: "public-entry",
        ok: false,
        expected: "status 200 without redirect",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const path of protectedRoutes) {
    try {
      results.push(evaluateProtectedRedirect(await fetchRoute(baseUrl, path), baseUrl));
    } catch (error) {
      results.push({
        path,
        url: `${baseUrl}${path}`,
        status: 0,
        location: "",
        kind: "protected-redirect",
        ok: false,
        expected: `redirect to /login with next=${expectedNextFor(path)}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    baseUrl,
    checkedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

function printHuman(report) {
  console.log(`Conversion funnel smoke: ${report.baseUrl} @ ${report.checkedAt}`);
  for (const r of report.results) {
    const mark = r.ok ? "✓" : "✗";
    const location = r.location ? ` location=${r.location}` : "";
    console.log(`${mark} ${r.path} ${r.kind} status=${r.status}${location}`);
    if (!r.ok) console.log(`  - ${r.error}`);
  }
  console.log(`conversion funnel smoke ${report.failed === 0 ? "passed" : "failed"} (${report.passed}/${report.total})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tools/conversion-funnel-smoke.mjs [--base-url https://www.keepioo.com] [--json]");
    process.exit(0);
  }

  const report = await runConversionFunnelSmoke({ baseUrl: args.baseUrl });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exit(report.failed === 0 ? 0 : 1);
}
