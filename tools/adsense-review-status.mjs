#!/usr/bin/env node
// ============================================================
// AdSense 재심사 추적 보드 생성 — read-only 운영 요약
// ============================================================

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OUTPUT = "docs/adsense-review-tracker.md";
const args = parseArgs(process.argv.slice(2));
const outputPath = args.output ? resolve(args.output) : resolve(DEFAULT_OUTPUT);
const baseUrl = process.env.ADSENSE_REVIEW_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";

function parseArgs(argv) {
  const out = { write: false, output: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") out.write = true;
    else if (arg === "--output") out.output = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function run(command, commandArgs, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, commandArgs, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stdout || error?.stderr || error?.message || error).trim(),
    };
  }
}

function parseKeyValues(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function formatCommandResult(result, successLabel = "성공", failLabel = "실패") {
  return result.ok ? successLabel : `${failLabel} — ${result.output.split(/\r?\n/).slice(-1)[0] || "unknown"}`;
}

if (args.help) {
  console.log(`Usage: node tools/adsense-review-status.mjs [--write] [--output ${DEFAULT_OUTPUT}]`);
  process.exit(0);
}

const generatedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
const gitHead = run("git", ["log", "-1", "--oneline"]);
const ciRun = run("gh", ["run", "list", "--branch", "master", "--workflow", "CI", "--limit", "1", "--json", "databaseId,status,conclusion,headSha,url,createdAt"]);
const sitemapSubmitRun = run("gh", ["run", "list", "--workflow", "Manual Site Cron Trigger", "--limit", "5", "--json", "databaseId,status,conclusion,headSha,url,createdAt,displayTitle"]);
const preflight = run("npm", ["run", "diagnose:adsense-review"], {
  env: { ...process.env, ADSENSE_REVIEW_STRICT_LINKS: "1", ADSENSE_REVIEW_BASE_URL: baseUrl },
});

const preflightValues = parseKeyValues(preflight.output);
let latestCi = null;
let latestSitemapSubmit = null;
try {
  latestCi = JSON.parse(ciRun.output || "[]")[0] ?? null;
} catch {}
try {
  latestSitemapSubmit = JSON.parse(sitemapSubmitRun.output || "[]").find((runItem) => runItem.status === "completed") ?? null;
} catch {}

const status = preflight.ok && latestCi?.conclusion === "success" ? "준비 완료" : "확인 필요";
const sitemapGuides = preflightValues.get("sitemap./guides") ?? "unknown";
const sitemapTotal = preflightValues.get("sitemap.loc_count") ?? "unknown";
const guideIssues = preflightValues.get("guide_quality.issues") ?? "unknown";
const guidePassed = preflightValues.get("guide_quality.passed") ?? "unknown";
const trustPageRows = ["/editorial-policy", "/source-policy", "/correction-policy"].map((path) => {
  const http = preflightValues.get(`${path}.http`) ?? "unknown";
  const robots = preflightValues.get(`${path}.robots`) ?? "unknown";
  return `- \`${path}\`: HTTP ${http}, robots \`${robots}\``;
});

const markdown = `# AdSense 재심사 추적 보드

- 상태: **${status}**
- 기준 시각: ${generatedAt}
- 대상 사이트: ${baseUrl}
- 최신 커밋: ${gitHead.ok ? `\`${gitHead.output}\`` : "확인 실패"}

## 제출 전 체크

- AdSense review preflight: **${formatCommandResult(preflight, "통과", "실패")}**
- GitHub CI: **${latestCi?.conclusion ?? "unknown"}**${latestCi?.url ? ` — ${latestCi.url}` : ""}
- Search Console sitemap 제출: **${latestSitemapSubmit?.conclusion ?? "unknown"}**${latestSitemapSubmit?.url ? ` — ${latestSitemapSubmit.url}` : ""}

## live sitemap / guide 품질

- sitemap URL 수: **${sitemapTotal}**
- guide URL 수: **${sitemapGuides}**
- guide quality 통과: **${guidePassed}**
- guide quality issues: **${guideIssues}**

## 신뢰 페이지 readback

${trustPageRows.join("\n")}

## AdSense 콘솔에서 할 일

1. AdSense 콘솔에서 사이트 심사 상태를 확인합니다.
2. 사이트가 준비됨 상태라면 재심사 요청 버튼을 누릅니다.
3. 제출 후 이 파일의 기준 시각과 Search Console 제출 run을 운영 기록으로 남깁니다.
4. 승인되면 \`NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads\` 복구 절차로 전환합니다.

## 실패 시 우선 확인

- preflight 실패: \`ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review\`
- sitemap 재제출: GitHub Actions \`Manual Site Cron Trigger\` → \`search-console-sitemap-submit\`
- 승인 후 복구: pricing/SaaS/sitemap/ad-script 복구 readback 후 진행
`;

if (args.write) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");
  console.log(`written=${outputPath}`);
} else {
  console.log(markdown);
}

if (!preflight.ok) process.exitCode = 1;
