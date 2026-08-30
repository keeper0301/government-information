#!/usr/bin/env node
// Read-only Naver SEO snapshot export/report CLI.
// Pulls naver_seo_snapshots rows from Supabase and renders the trend dashboard/weekly summary.

import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  buildNaverSeoTrendDashboard,
  renderNaverSeoTrendMarkdown,
  renderNaverSeoWeeklySummary,
} from "./trends.mjs";

export const NAVER_SEO_SNAPSHOT_COLUMNS = [
  "collected_at",
  "indexed_count",
  "index_excluded",
  "crawl_limited",
  "seo_issues",
  "diagnosis_updated",
  "total_impressions",
  "total_clicks",
  "avg_ctr",
  "top_keywords",
  "top_pages",
  "expose_updated",
].join(",");

function parseLimit(value, fallback = 8) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function fetchNaverSeoSnapshots(client, { limit = 8 } = {}) {
  const safeLimit = parseLimit(limit);
  const { data, error } = await client
    .from("naver_seo_snapshots")
    .select(NAVER_SEO_SNAPSHOT_COLUMNS)
    .order("collected_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`naver_seo_snapshots 조회 실패: ${error.message}`);
  return [...(data ?? [])].reverse();
}

export function buildNaverSeoSnapshotArtifacts(rows, today) {
  const dashboard = buildNaverSeoTrendDashboard(rows, today);
  return {
    dashboard,
    markdown: renderNaverSeoTrendMarkdown(dashboard),
    weekly: renderNaverSeoWeeklySummary(dashboard),
  };
}

function adminFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

async function notifyTelegram(text) {
  if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET 누락: --notify 사용 불가");
  const res = await fetch("https://www.keepioo.com/api/notify-telegram", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Telegram notify 실패: HTTP ${res.status}`);
}

function parseArgs(argv) {
  const opts = { limit: 8, jsonOutput: null, markdownOutput: null, weeklyOutput: null, json: false, weekly: false, notify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") opts.limit = parseLimit(argv[++i]);
    else if (arg === "--json-output") opts.jsonOutput = argv[++i] ?? null;
    else if (arg === "--markdown-output") opts.markdownOutput = argv[++i] ?? null;
    else if (arg === "--weekly-output") opts.weeklyOutput = argv[++i] ?? null;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--weekly") opts.weekly = true;
    else if (arg === "--notify") opts.notify = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/naver-seo/snapshots.mjs [--limit N] [--json] [--weekly] [--json-output PATH] [--markdown-output PATH] [--weekly-output PATH] [--notify]");
      process.exit(0);
    }
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const rows = await fetchNaverSeoSnapshots(adminFromEnv(), { limit: opts.limit });
    const artifacts = buildNaverSeoSnapshotArtifacts(rows);
    if (opts.json) console.log(JSON.stringify(artifacts.dashboard, null, 2));
    else console.log(opts.weekly ? artifacts.weekly : artifacts.markdown);
    if (opts.jsonOutput) await writeFile(opts.jsonOutput, `${JSON.stringify(artifacts.dashboard, null, 2)}\n`, "utf8");
    if (opts.markdownOutput) await writeFile(opts.markdownOutput, artifacts.markdown, "utf8");
    if (opts.weeklyOutput) await writeFile(opts.weeklyOutput, artifacts.weekly, "utf8");
    if (opts.notify) await notifyTelegram(artifacts.weekly);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
