#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";

const EXPECTED_GROUPS = [
  {
    name: "public-daily",
    cacheControl: "public, s-maxage=86400, stale-while-revalidate=31449600",
    paths: ["/help", "/privacy", "/terms", "/refund", "/consult"],
    allowSetCookie: false,
  },
  {
    name: "public-auth-shell",
    cacheControl: "public, s-maxage=3600, stale-while-revalidate=31532400",
    paths: ["/login", "/signup", "/signup/sent", "/forgot-password", "/reset-password"],
    allowSetCookie: false,
  },
  {
    name: "public-short",
    cacheControl: "public, s-maxage=60, stale-while-revalidate=31535940",
    paths: ["/guides"],
    allowSetCookie: false,
  },
];

const PRIVATE_PATHS = ["/admin", "/mypage", "/checkout", "/pricing", "/?ref=ABCDEF"];
const UX_TEXT_CHECKS = [
  {
    path: "/login",
    label: "login value proposition",
    anyOf: [
      "관심 지역·정책 알림을 놓치지 않게 저장해드려요",
      "로그인하면",
    ],
  },
  {
    path: "/signup",
    label: "signup primary CTA",
    anyOf: [
      "무료로 맞춤 정책 알림 시작하기",
      "맞춤 정책 알림",
    ],
  },
  {
    path: "/signup/sent",
    label: "signup email next step",
    anyOf: [
      "관심 지역과 주제를 고르면 맞춤 알림이 시작돼요",
      "확인 링크를 누르면 자동으로 로그인됩니다",
    ],
  },
  {
    path: "/forgot-password",
    label: "password reset non-enumeration copy",
    anyOf: [
      "보안을 위해 가입 여부는 알려드리지 않아요",
      "가입 여부는 알려드리지 않아요",
    ],
  },
];
const DEFAULT_BASE_URL = "https://www.keepioo.com";

function parseArgs(argv) {
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    methods: ["HEAD", "GET"],
    json: false,
    retries: 1,
    retryDelayMs: 1500,
    ux: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--method") out.methods = [argv[++i].toUpperCase()];
    else if (arg === "--methods") out.methods = argv[++i].split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    else if (arg === "--json") out.json = true;
    else if (arg === "--retries") out.retries = Number(argv[++i]);
    else if (arg === "--retry-delay-ms") out.retryDelayMs = Number(argv[++i]);
    else if (arg === "--skip-ux") out.ux = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node tools/verify-production-cache-headers.mjs [--base-url https://www.keepioo.com] [--methods HEAD,GET] [--json] [--skip-ux]`);
      process.exit(0);
    }
  }

  out.baseUrl = out.baseUrl.replace(/\/$/, "");
  return out;
}

function isPrivateNoStore(value) {
  const lower = String(value || "").toLowerCase();
  return lower.includes("private") && lower.includes("no-store");
}

async function requestOnce(baseUrl, method, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: "manual",
    headers: {
      "User-Agent": "keepioo-cache-monitor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  return {
    path,
    method,
    status: response.status,
    cacheControl: response.headers.get("cache-control") || "",
    xVercelCache: response.headers.get("x-vercel-cache") || "",
    xMatchedPath: response.headers.get("x-matched-path") || "",
    location: response.headers.get("location") || "",
    setCookie: Boolean(response.headers.get("set-cookie")),
  };
}

async function requestWithRetries(baseUrl, method, path, retries, retryDelayMs) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestOnce(baseUrl, method, path);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(retryDelayMs);
    }
  }
  throw lastError;
}

async function requestTextWithRetries(baseUrl, path, retries, retryDelayMs) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "keepioo-cache-monitor/1.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const text = await response.text();
      return {
        path,
        method: "GET_UX",
        status: response.status,
        cacheControl: response.headers.get("cache-control") || "",
        xVercelCache: response.headers.get("x-vercel-cache") || "",
        xMatchedPath: response.headers.get("x-matched-path") || "",
        location: response.headers.get("location") || "",
        setCookie: Boolean(response.headers.get("set-cookie")),
        text,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(retryDelayMs);
    }
  }
  throw lastError;
}

function evaluate(result, rule) {
  const errors = [];
  if (rule.kind === "public") {
    if (result.status !== 200) errors.push(`expected status 200, got ${result.status}`);
    if (result.cacheControl !== rule.cacheControl) {
      errors.push(`expected cache-control ${JSON.stringify(rule.cacheControl)}, got ${JSON.stringify(result.cacheControl)}`);
    }
    if (!rule.allowSetCookie && result.setCookie) errors.push("unexpected set-cookie on public cache path");
    if (isPrivateNoStore(result.cacheControl)) errors.push("public path returned private/no-store");
  } else {
    if (!isPrivateNoStore(result.cacheControl)) {
      errors.push(`expected private/no-store, got ${JSON.stringify(result.cacheControl)}`);
    }
  }
  return { ...result, group: rule.group, ok: errors.length === 0, errors };
}

function evaluateUx(result, rule) {
  const errors = [];
  if (result.status !== 200) errors.push(`expected status 200, got ${result.status}`);
  if (result.setCookie) errors.push("unexpected set-cookie on UX smoke path");
  const snippets = rule.anyOf || [rule.text].filter(Boolean);
  if (!snippets.some((snippet) => result.text.includes(snippet))) {
    errors.push(`missing UX text for ${rule.label || rule.path}: expected one of ${JSON.stringify(snippets)}`);
  }
  return {
    path: result.path,
    method: result.method,
    group: "auth-ux-text",
    ok: errors.length === 0,
    status: result.status,
    cacheControl: result.cacheControl,
    xVercelCache: result.xVercelCache,
    xMatchedPath: result.xMatchedPath,
    location: result.location,
    setCookie: result.setCookie,
    errors,
  };
}

export async function runCacheHeaderCheck(options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const methods = options.methods || ["HEAD", "GET"];
  const retries = Number.isFinite(options.retries) ? options.retries : 1;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 1500;
  const rules = [
    ...EXPECTED_GROUPS.flatMap((group) =>
      group.paths.map((path) => ({
        kind: "public",
        group: group.name,
        path,
        cacheControl: group.cacheControl,
        allowSetCookie: group.allowSetCookie,
      })),
    ),
    ...PRIVATE_PATHS.map((path) => ({ kind: "private", group: "private-protected", path })),
  ];

  const checks = [];
  for (const method of methods) {
    for (const rule of rules) {
      try {
        const result = await requestWithRetries(baseUrl, method, rule.path, retries, retryDelayMs);
        checks.push(evaluate(result, rule));
      } catch (error) {
        checks.push({
          path: rule.path,
          method,
          group: rule.group,
          ok: false,
          status: 0,
          cacheControl: "",
          xVercelCache: "",
          xMatchedPath: "",
          location: "",
          setCookie: false,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
  }

  if (options.ux !== false) {
    for (const rule of UX_TEXT_CHECKS) {
      try {
        const result = await requestTextWithRetries(baseUrl, rule.path, retries, retryDelayMs);
        checks.push(evaluateUx(result, rule));
      } catch (error) {
        checks.push({
          path: rule.path,
          method: "GET_UX",
          group: "auth-ux-text",
          ok: false,
          status: 0,
          cacheControl: "",
          xVercelCache: "",
          xMatchedPath: "",
          location: "",
          setCookie: false,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    baseUrl,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

function printHuman(report) {
  console.log(`Cache header check: ${report.baseUrl} @ ${report.checkedAt}`);
  for (const check of report.checks) {
    const mark = check.ok ? "✓" : "✗";
    console.log(`${mark} ${check.method} ${check.path} [${check.group}] status=${check.status} cache=${check.cacheControl || "-"} vercel=${check.xVercelCache || "-"} setCookie=${check.setCookie}`);
    for (const error of check.errors || []) console.log(`  - ${error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = await runCacheHeaderCheck(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exit(report.ok ? 0 : 1);
}
