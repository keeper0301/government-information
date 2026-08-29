#!/usr/bin/env node
// Naver Search Advisor HTML regression audit.
// Checks crawler-visible title/description/H1/img-alt issues across sitemap URLs.

import * as cheerio from 'cheerio';
import { writeFile } from 'node:fs/promises';

const DEFAULT_SITE = 'https://www.keepioo.com';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CONCURRENCY = 6;

export function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncateText(value, max = 140) {
  const text = normalizeText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function analyzeHtml(html, url = '') {
  const $ = cheerio.load(html ?? '');
  const title = normalizeText($('title').first().text());
  const description = normalizeText($('meta[name="description"]').first().attr('content'));
  const canonical = normalizeText($('link[rel="canonical"]').first().attr('href'));
  const robots = normalizeText($('meta[name="robots"]').first().attr('content'));
  const h1 = $('h1').map((_, el) => normalizeText($(el).text())).get().filter(Boolean);
  const images = $('img').map((_, el) => {
    const attribs = el.attribs ?? {};
    const src = normalizeText(attribs.src || attribs['data-src'] || attribs.srcset || '');
    const hasAlt = Object.prototype.hasOwnProperty.call(attribs, 'alt');
    const alt = normalizeText(attribs.alt);
    return { src, hasAlt, alt };
  }).get();
  const imgWithoutAlt = images.filter((image) => !image.hasAlt);
  const imgEmptyAlt = images.filter((image) => image.hasAlt && !image.alt);

  const issues = [];
  const warnings = [];
  if (!title) issues.push('missing_title');
  if (!description) issues.push('missing_description');
  if (description && description.length < 40) issues.push('short_description');
  if (!canonical) warnings.push('missing_canonical');
  if (/\bnoindex\b/i.test(robots)) warnings.push('robots_noindex');
  if (h1.length === 0) issues.push('missing_h1');
  if (h1.length > 1) issues.push('multiple_h1');
  if (imgWithoutAlt.length > 0) issues.push('image_missing_alt');
  if (imgEmptyAlt.length > 0) issues.push('image_empty_alt');

  return {
    url,
    title,
    description,
    canonical,
    robots,
    h1,
    h1Count: h1.length,
    imageCount: images.length,
    imgWithoutAltCount: imgWithoutAlt.length,
    imgEmptyAltCount: imgEmptyAlt.length,
    issues,
    warnings,
  };
}

export function findDuplicateValues(rows, key) {
  const buckets = new Map();
  for (const row of rows) {
    const value = normalizeText(row[key]);
    if (!value) continue;
    const list = buckets.get(value) ?? [];
    list.push(row.url);
    buckets.set(value, list);
  }
  return [...buckets.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, count: urls.length, urls }));
}

export function parseSitemapUrls(xml) {
  const matches = [...String(xml ?? '').matchAll(/<loc>(.*?)<\/loc>/gims)];
  return matches.map((match) => match[1].trim()).filter(Boolean);
}

export function parseExtraUrls(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} sitemapUrls
 * @param {string[]} extraUrls
 * @param {number | null} limit
 */
export function mergeAuditUrls(sitemapUrls, extraUrls = [], limit = null) {
  const normalizedExtras = extraUrls.map((url) => normalizeText(url)).filter(Boolean);
  const limitedSitemapUrls = sitemapUrls.slice(0, limit ?? undefined);
  return [...new Set([...limitedSitemapUrls, ...normalizedExtras])];
}

function parseArgs(argv) {
  const opts = {
    site: DEFAULT_SITE,
    sitemap: null,
    extraUrls: [],
    limit: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    json: false,
    jsonOutput: null,
    failOnIssues: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site') opts.site = argv[++i] ?? opts.site;
    else if (arg === '--sitemap') opts.sitemap = argv[++i] ?? opts.sitemap;
    else if (arg === '--extra-url') opts.extraUrls.push(argv[++i] ?? '');
    else if (arg === '--extra-urls') opts.extraUrls.push(...parseExtraUrls(argv[++i] ?? ''));
    else if (arg === '--limit') opts.limit = Number(argv[++i]);
    else if (arg === '--timeout-ms') opts.timeoutMs = Number(argv[++i]);
    else if (arg === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (arg === '--json') opts.json = true;
    else if (arg === '--json-output') opts.jsonOutput = argv[++i] ?? opts.jsonOutput;
    else if (arg === '--fail-on-issues') opts.failOnIssues = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/naver-seo-html-audit.mjs [--site URL] [--sitemap URL] [--limit N] [--extra-url URL] [--extra-urls URLS] [--json] [--json-output PATH] [--fail-on-issues]');
      process.exit(0);
    }
  }
  if (!opts.sitemap) opts.sitemap = new URL('/sitemap.xml', opts.site).toString();
  opts.concurrency = Number.isFinite(opts.concurrency) && opts.concurrency > 0 ? Math.floor(opts.concurrency) : DEFAULT_CONCURRENCY;
  opts.timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? Math.floor(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) opts.limit = null;
  return opts;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'keepioo-naver-seo-html-audit/1.0' },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function auditSite(opts = {}) {
  const options = { ...parseArgs([]), ...opts };
  const sitemapXml = await fetchText(options.sitemap, options.timeoutMs);
  const urls = mergeAuditUrls(parseSitemapUrls(sitemapXml), options.extraUrls, options.limit);
  const rows = await mapLimit(urls, options.concurrency, async (url) => {
    try {
      const html = await fetchText(url, options.timeoutMs);
      return { ok: true, ...analyzeHtml(html, url) };
    } catch (error) {
      return { ok: false, url, issues: ['fetch_failed'], error: error instanceof Error ? error.message : String(error) };
    }
  });
  const duplicateTitles = findDuplicateValues(rows.filter((row) => row.ok), 'title');
  const duplicateDescriptions = findDuplicateValues(rows.filter((row) => row.ok), 'description');
  const issueCounts = rows.reduce((acc, row) => {
    for (const issue of row.issues ?? []) acc[issue] = (acc[issue] ?? 0) + 1;
    return acc;
  }, {});
  const warningCounts = rows.reduce((acc, row) => {
    for (const warning of row.warnings ?? []) acc[warning] = (acc[warning] ?? 0) + 1;
    return acc;
  }, {});
  if (duplicateTitles.length > 0) issueCounts.duplicate_title = duplicateTitles.reduce((sum, item) => sum + item.count, 0);
  if (duplicateDescriptions.length > 0) issueCounts.duplicate_description = duplicateDescriptions.reduce((sum, item) => sum + item.count, 0);
  return {
    checkedAt: new Date().toISOString(),
    sitemap: options.sitemap,
    urlCount: urls.length,
    okCount: rows.filter((row) => row.ok).length,
    issueCounts,
    warningCounts,
    duplicateTitles,
    duplicateDescriptions,
    issueRows: rows.filter((row) => (row.issues ?? []).length > 0),
    warningRows: rows.filter((row) => (row.warnings ?? []).length > 0),
    rows,
  };
}

function printTextReport(result) {
  console.log(`Naver SEO HTML audit: ${result.okCount}/${result.urlCount} URLs fetched`);
  const issueEntries = Object.entries(result.issueCounts).sort((a, b) => b[1] - a[1]);
  if (issueEntries.length === 0) {
    console.log('OK: no crawler-visible title/description/H1/img-alt issues in sitemap sample');
  } else {
    console.log('Issues:');
    for (const [issue, count] of issueEntries) console.log(`- ${issue}: ${count}`);
    for (const row of result.issueRows.slice(0, 10)) {
      console.log(`\n${row.url}`);
      console.log(`  issues: ${(row.issues ?? []).join(', ')}`);
      if (row.title) console.log(`  title: ${truncateText(row.title)}`);
      if (row.description) console.log(`  description: ${truncateText(row.description)}`);
      if (row.h1) console.log(`  h1: ${row.h1Count} ${row.h1.map((v) => truncateText(v, 60)).join(' | ')}`);
      if (row.error) console.log(`  error: ${row.error}`);
    }
  }
  const warningEntries = Object.entries(result.warningCounts ?? {}).sort((a, b) => b[1] - a[1]);
  if (warningEntries.length > 0) {
    console.log('Warnings:');
    for (const [warning, count] of warningEntries) console.log(`- ${warning}: ${count}`);
  }
  for (const dup of result.duplicateTitles.slice(0, 5)) {
    console.log(`\nduplicate title (${dup.count}): ${truncateText(dup.value)}`);
    for (const url of dup.urls.slice(0, 5)) console.log(`  - ${url}`);
  }
  for (const dup of result.duplicateDescriptions.slice(0, 5)) {
    console.log(`\nduplicate description (${dup.count}): ${truncateText(dup.value)}`);
    for (const url of dup.urls.slice(0, 5)) console.log(`  - ${url}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  auditSite(opts)
    .then(async (result) => {
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else printTextReport(result);
      if (opts.jsonOutput) await writeFile(opts.jsonOutput, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      if (opts.failOnIssues && Object.keys(result.issueCounts).length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
}
