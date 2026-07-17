#!/usr/bin/env node
import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "https://www.keepioo.com";
const DEFAULT_PATHS = ["/help", "/guides", "/login", "/signup", "/privacy"];

function parseArgs(argv) {
  const out = { baseUrl: DEFAULT_BASE_URL, paths: DEFAULT_PATHS, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--paths") out.paths = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/measure-public-pages.mjs [--base-url https://www.keepioo.com] [--paths /help,/guides] [--json]");
      process.exit(0);
    }
  }
  out.baseUrl = out.baseUrl.replace(/\/$/, "");
  return out;
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

async function measurePath(baseUrl, path) {
  const url = `${baseUrl}${path}`;
  const started = performance.now();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "keepioo-public-page-measure/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const firstByteAt = performance.now();
  const html = await response.text();
  const ended = performance.now();
  return {
    path,
    status: response.status,
    cacheControl: response.headers.get("cache-control") || "",
    xVercelCache: response.headers.get("x-vercel-cache") || "",
    ttfbMs: Math.round(firstByteAt - started),
    totalMs: Math.round(ended - started),
    htmlBytes: byteLength(html),
    scriptTags: countMatches(html, /<script\b/gi),
    linkPreloads: countMatches(html, /rel=["']preload["']/gi),
    title: html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() || "",
  };
}

export async function measurePublicPages(options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const paths = options.paths || DEFAULT_PATHS;
  const results = [];
  for (const path of paths) {
    try {
      results.push(await measurePath(baseUrl, path));
    } catch (error) {
      results.push({
        path,
        status: 0,
        cacheControl: "",
        xVercelCache: "",
        ttfbMs: null,
        totalMs: null,
        htmlBytes: 0,
        scriptTags: 0,
        linkPreloads: 0,
        title: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { baseUrl, measuredAt: new Date().toISOString(), results };
}

function printHuman(report) {
  console.log(`Public page performance probe: ${report.baseUrl} @ ${report.measuredAt}`);
  for (const r of report.results) {
    const status = r.status === 200 ? "✓" : "✗";
    console.log(`${status} ${r.path} status=${r.status} ttfb=${r.ttfbMs ?? "-"}ms total=${r.totalMs ?? "-"}ms html=${r.htmlBytes}B scripts=${r.scriptTags} cache=${r.cacheControl || "-"}`);
    if (r.error) console.log(`  - ${r.error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = await measurePublicPages(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exit(report.results.every((r) => r.status === 200) ? 0 : 1);
}
