#!/usr/bin/env node
// Naver Search Advisor snapshot trend dashboard/report builder.
// Pure offline CLI: reads exported naver_seo_snapshots rows or collect.mjs-shaped JSON snapshots.

import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://www.keepioo.com";

function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumObjectValues(value) {
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce((sum, item) => sum + (asNumber(item) ?? 0), 0);
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSnapshot(snapshot) {
  const diagnosis = snapshot.diagnosis ?? {};
  const expose = snapshot.expose ?? {};
  const collectedAt = snapshot.collected_at ?? snapshot.collectedAt ?? snapshot.checkedAt ?? null;
  const seoIssues = snapshot.seo_issues ?? diagnosis.issues ?? snapshot.issueCounts ?? {};
  const topKeywords = snapshot.top_keywords ?? expose.top_keywords ?? [];
  const topPages = snapshot.top_pages ?? expose.top_pages ?? [];

  return {
    collectedAt,
    indexedCount: asNumber(snapshot.indexed_count ?? diagnosis.indexed_count),
    indexExcluded: asNumber(snapshot.index_excluded ?? diagnosis.index_excluded),
    crawlLimited: asNumber(snapshot.crawl_limited ?? diagnosis.crawl_limited),
    totalImpressions: asNumber(snapshot.total_impressions ?? expose.total_impressions),
    totalClicks: asNumber(snapshot.total_clicks ?? expose.total_clicks),
    avgCtr: asNumber(snapshot.avg_ctr ?? expose.avg_ctr),
    seoIssues,
    seoIssueTotal: sumObjectValues(seoIssues),
    topKeywords: normalizeList(topKeywords),
    topPages: normalizeList(topPages),
  };
}

function sortSnapshots(snapshots) {
  return [...snapshots].sort((a, b) => String(a.collectedAt ?? "").localeCompare(String(b.collectedAt ?? "")));
}

function delta(current, previous) {
  if (current == null || previous == null) return null;
  return current - previous;
}

function formatDelta(value, suffix = "") {
  if (value == null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

function formatNumber(value) {
  if (value == null) return "n/a";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function keywordKey(row) {
  return String(row?.label ?? "").trim();
}

function pageUrl(row) {
  return String(row?.label ?? row?.url ?? "").trim();
}

function buildLowCtrPages(current, limit = 5) {
  return current.topPages
    .filter((page) => (asNumber(page.impression) ?? 0) >= 50 && (asNumber(page.ctr) ?? 100) < 5)
    .slice(0, limit)
    .map((page) => ({
      url: pageUrl(page),
      path: pageUrl(page).replace(SITE, "") || pageUrl(page),
      impression: asNumber(page.impression),
      click: asNumber(page.click),
      ctr: asNumber(page.ctr),
    }));
}

function buildFreshKeywords(current, previous, limit = 5) {
  const previousKeywords = new Set((previous?.topKeywords ?? []).map(keywordKey));
  return current.topKeywords
    .filter((keyword) => keywordKey(keyword) && !previousKeywords.has(keywordKey(keyword)))
    .slice(0, limit)
    .map((keyword) => ({
      label: keywordKey(keyword),
      impression: asNumber(keyword.impression),
      click: asNumber(keyword.click),
      ctr: asNumber(keyword.ctr),
    }));
}

function buildTrendPoints(snapshots) {
  return snapshots.map((snapshot) => ({
    collectedAt: snapshot.collectedAt,
    indexedCount: snapshot.indexedCount,
    totalImpressions: snapshot.totalImpressions,
    totalClicks: snapshot.totalClicks,
    avgCtr: snapshot.avgCtr,
    seoIssueTotal: snapshot.seoIssueTotal,
  }));
}

function buildActionItems(metrics, lowCtrPages, freshKeywords) {
  const items = [];
  if ((metrics.seoIssueDelta ?? 0) > 0) {
    items.push(`SEO 진단 이슈가 ${metrics.seoIssueDelta}건 늘었습니다. Search Advisor 진단 상세를 먼저 확인하세요.`);
  }
  if ((metrics.impressionsDelta ?? 0) > 0 && (metrics.clicksDelta ?? 0) <= 0) {
    items.push("노출은 늘었는데 클릭이 따라오지 않습니다. 제목/description/상단 CTA를 우선 점검하세요.");
  }
  for (const page of lowCtrPages.slice(0, 2)) {
    items.push(`${page.path} CTR ${page.ctr ?? "n/a"}%입니다. 검색 intent에 맞게 title/description을 다시 써볼 후보입니다.`);
  }
  if (freshKeywords.length > 0) {
    items.push(`새 키워드 ${freshKeywords.slice(0, 3).map((keyword) => keyword.label).join(", ")} 관련 랜딩/콘텐츠를 확인하세요.`);
  }
  if (items.length === 0) items.push("이번 주는 급한 SEO 조치 없음. 색인·노출 추세만 계속 관찰하면 됩니다.");
  return items.slice(0, 5);
}

export function buildNaverSeoTrendDashboard(inputSnapshots, today = new Date().toISOString().slice(0, 10)) {
  const snapshots = sortSnapshots(inputSnapshots.map(normalizeSnapshot)).filter((snapshot) => snapshot.collectedAt);
  if (snapshots.length === 0) {
    return {
      generatedAt: today,
      snapshotCount: 0,
      status: "empty",
      summary: "No Naver SEO snapshots available.",
      metrics: {},
      lowCtrPages: [],
      freshKeywords: [],
      trendPoints: [],
    };
  }

  const current = snapshots.at(-1);
  const previous = snapshots.length > 1 ? snapshots.at(-2) : null;
  const metrics = {
    indexedCount: current.indexedCount,
    indexedDelta: delta(current.indexedCount, previous?.indexedCount),
    indexExcluded: current.indexExcluded,
    totalImpressions: current.totalImpressions,
    impressionsDelta: delta(current.totalImpressions, previous?.totalImpressions),
    totalClicks: current.totalClicks,
    clicksDelta: delta(current.totalClicks, previous?.totalClicks),
    avgCtr: current.avgCtr,
    avgCtrDelta: delta(current.avgCtr, previous?.avgCtr),
    seoIssueTotal: current.seoIssueTotal,
    seoIssueDelta: delta(current.seoIssueTotal, previous?.seoIssueTotal),
  };

  const lowCtrPages = buildLowCtrPages(current);
  const freshKeywords = buildFreshKeywords(current, previous);

  return {
    generatedAt: today,
    snapshotCount: snapshots.length,
    status: "ok",
    currentAt: current.collectedAt,
    previousAt: previous?.collectedAt ?? null,
    metrics,
    seoIssues: current.seoIssues,
    lowCtrPages,
    freshKeywords,
    actionItems: buildActionItems(metrics, lowCtrPages, freshKeywords),
    trendPoints: buildTrendPoints(snapshots),
  };
}

export function renderNaverSeoTrendMarkdown(dashboard) {
  if (dashboard.status === "empty") return `# Naver SEO trend dashboard\n\n${dashboard.summary}\n`;
  const m = dashboard.metrics;
  const lines = [
    "# Naver SEO trend dashboard",
    "",
    `- generated: ${dashboard.generatedAt}`,
    `- snapshots: ${dashboard.snapshotCount}`,
    `- current: ${dashboard.currentAt}`,
    `- previous: ${dashboard.previousAt ?? "none"}`,
    "",
    "## KPI",
    "",
    `- indexed: ${formatNumber(m.indexedCount)} (${formatDelta(m.indexedDelta)})`,
    `- impressions: ${formatNumber(m.totalImpressions)} (${formatDelta(m.impressionsDelta)})`,
    `- clicks: ${formatNumber(m.totalClicks)} (${formatDelta(m.clicksDelta)})`,
    `- CTR: ${m.avgCtr ?? "n/a"}% (${formatDelta(m.avgCtrDelta, "%p")})`,
    `- SEO issue total: ${formatNumber(m.seoIssueTotal)} (${formatDelta(m.seoIssueDelta)})`,
    "",
    "## Low CTR pages",
    "",
  ];
  if (dashboard.lowCtrPages.length === 0) lines.push("- none");
  else {
    for (const page of dashboard.lowCtrPages) {
      lines.push(`- ${page.path} — impressions ${formatNumber(page.impression)}, clicks ${formatNumber(page.click)}, CTR ${page.ctr ?? "n/a"}%`);
    }
  }
  lines.push("", "## Fresh keywords", "");
  if (dashboard.freshKeywords.length === 0) lines.push("- none");
  else {
    for (const keyword of dashboard.freshKeywords) {
      lines.push(`- ${keyword.label} — impressions ${formatNumber(keyword.impression)}, clicks ${formatNumber(keyword.click)}, CTR ${keyword.ctr ?? "n/a"}%`);
    }
  }
  lines.push("", "## Trend points", "");
  for (const point of dashboard.trendPoints.slice(-8)) {
    lines.push(`- ${point.collectedAt}: indexed ${formatNumber(point.indexedCount)}, impressions ${formatNumber(point.totalImpressions)}, clicks ${formatNumber(point.totalClicks)}, issues ${formatNumber(point.seoIssueTotal)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderNaverSeoWeeklySummary(dashboard) {
  if (dashboard.status === "empty") return "네이버 SEO 주간 요약\n\n스냅샷 데이터가 아직 없습니다.";
  const m = dashboard.metrics;
  const lines = [
    `네이버 SEO 주간 요약 (${dashboard.generatedAt})`,
    "",
    `색인 ${formatNumber(m.indexedCount)} (${formatDelta(m.indexedDelta)}) · 노출 ${formatNumber(m.totalImpressions)} (${formatDelta(m.impressionsDelta)}) · 클릭 ${formatNumber(m.totalClicks)} (${formatDelta(m.clicksDelta)})`,
    `CTR ${m.avgCtr ?? "n/a"}% (${formatDelta(m.avgCtrDelta, "%p")}) · SEO 이슈 ${formatNumber(m.seoIssueTotal)} (${formatDelta(m.seoIssueDelta)})`,
    "",
    "이번 주 볼 것",
  ];
  for (const item of dashboard.actionItems ?? []) lines.push(`- ${item}`);
  if (dashboard.lowCtrPages.length > 0) {
    lines.push("", "저CTR 우선 후보");
    for (const page of dashboard.lowCtrPages.slice(0, 3)) lines.push(`- ${page.path} · 노출 ${formatNumber(page.impression)} · CTR ${page.ctr ?? "n/a"}%`);
  }
  if (dashboard.freshKeywords.length > 0) {
    lines.push("", `새 키워드: ${dashboard.freshKeywords.slice(0, 5).map((keyword) => keyword.label).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const opts = { input: null, jsonOutput: null, markdownOutput: null, weeklyOutput: null, json: false, weekly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") opts.input = argv[++i] ?? null;
    else if (arg === "--json-output") opts.jsonOutput = argv[++i] ?? null;
    else if (arg === "--markdown-output") opts.markdownOutput = argv[++i] ?? null;
    else if (arg === "--weekly-output") opts.weeklyOutput = argv[++i] ?? null;
    else if (arg === "--weekly") opts.weekly = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/naver-seo/trends.mjs --input snapshots.json [--json] [--weekly] [--json-output PATH] [--markdown-output PATH] [--weekly-output PATH]");
      process.exit(0);
    }
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("--input snapshots.json is required");
    process.exit(1);
  }
  const snapshots = JSON.parse(await readFile(opts.input, "utf8"));
  const rows = Array.isArray(snapshots) ? snapshots : snapshots.snapshots;
  if (!Array.isArray(rows)) {
    console.error("input must be an array or { snapshots: [...] }");
    process.exit(1);
  }
  const dashboard = buildNaverSeoTrendDashboard(rows);
  const markdown = renderNaverSeoTrendMarkdown(dashboard);
  const weekly = renderNaverSeoWeeklySummary(dashboard);
  if (opts.json) console.log(JSON.stringify(dashboard, null, 2));
  else console.log(opts.weekly ? weekly : markdown);
  if (opts.jsonOutput) await writeFile(opts.jsonOutput, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  if (opts.markdownOutput) await writeFile(opts.markdownOutput, markdown, "utf8");
  if (opts.weeklyOutput) await writeFile(opts.weeklyOutput, weekly, "utf8");
}
