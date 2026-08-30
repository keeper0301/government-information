#!/usr/bin/env node
// Compare two Naver SEO HTML audit JSON artifacts.

import { readFile, writeFile } from 'node:fs/promises';

function normalizeCountMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function diffCountMap(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const rows = [];
  for (const key of keys) {
    const previous = Number(before[key] ?? 0);
    const current = Number(after[key] ?? 0);
    const delta = current - previous;
    if (delta !== 0) rows.push({ key, before: previous, after: current, delta });
  }
  return rows;
}

function asUrlSet(rows = []) {
  return new Set(rows.map((row) => String(row?.url ?? '')).filter(Boolean));
}

function countByUrl(rows = [], field) {
  const out = new Map();
  for (const row of rows) {
    const url = String(row?.url ?? '');
    if (!url) continue;
    out.set(url, [...(row?.[field] ?? [])]);
  }
  return out;
}

function changedRowSignals(beforeRows = [], afterRows = [], field) {
  const before = countByUrl(beforeRows, field);
  const after = countByUrl(afterRows, field);
  const urls = [...new Set([...before.keys(), ...after.keys()])].sort();
  return urls
    .map((url) => {
      const previous = before.get(url) ?? [];
      const current = after.get(url) ?? [];
      const beforeText = previous.slice().sort().join(',');
      const afterText = current.slice().sort().join(',');
      if (beforeText === afterText) return null;
      return { url, before: previous, after: current };
    })
    .filter(Boolean);
}

function rowSignalDeltas(beforeRows = [], afterRows = [], field) {
  const before = countByUrl(beforeRows, field);
  const after = countByUrl(afterRows, field);
  const urls = [...new Set([...before.keys(), ...after.keys()])].sort();
  const added = [];
  const resolved = [];
  for (const url of urls) {
    const previous = new Set(before.get(url) ?? []);
    const current = new Set(after.get(url) ?? []);
    const addedSignals = [...current].filter((signal) => !previous.has(signal)).sort();
    const resolvedSignals = [...previous].filter((signal) => !current.has(signal)).sort();
    if (addedSignals.length > 0) added.push({ url, signals: addedSignals });
    if (resolvedSignals.length > 0) resolved.push({ url, signals: resolvedSignals });
  }
  return { added, resolved };
}

export function compareAuditArtifacts(beforeArtifact, afterArtifact) {
  const beforeRows = Array.isArray(beforeArtifact?.rows) ? beforeArtifact.rows : [];
  const afterRows = Array.isArray(afterArtifact?.rows) ? afterArtifact.rows : [];
  const beforeUrlSet = asUrlSet(beforeRows);
  const afterUrlSet = asUrlSet(afterRows);
  const addedUrls = [...afterUrlSet].filter((url) => !beforeUrlSet.has(url)).sort();
  const removedUrls = [...beforeUrlSet].filter((url) => !afterUrlSet.has(url)).sort();
  const issueDeltas = diffCountMap(normalizeCountMap(beforeArtifact?.issueCounts), normalizeCountMap(afterArtifact?.issueCounts));
  const warningDeltas = diffCountMap(normalizeCountMap(beforeArtifact?.warningCounts), normalizeCountMap(afterArtifact?.warningCounts));
  const changedIssueRows = changedRowSignals(beforeRows, afterRows, 'issues');
  const changedWarningRows = changedRowSignals(beforeRows, afterRows, 'warnings');
  const issueRowDeltas = rowSignalDeltas(beforeRows, afterRows, 'issues');
  const warningRowDeltas = rowSignalDeltas(beforeRows, afterRows, 'warnings');

  return {
    before: {
      checkedAt: beforeArtifact?.checkedAt ?? null,
      okCount: beforeArtifact?.okCount ?? 0,
      urlCount: beforeArtifact?.urlCount ?? beforeRows.length,
    },
    after: {
      checkedAt: afterArtifact?.checkedAt ?? null,
      okCount: afterArtifact?.okCount ?? 0,
      urlCount: afterArtifact?.urlCount ?? afterRows.length,
    },
    urlDelta: {
      added: addedUrls,
      removed: removedUrls,
    },
    issueDeltas,
    warningDeltas,
    changedIssueRows,
    changedWarningRows,
    addedIssueRows: issueRowDeltas.added,
    resolvedIssueRows: issueRowDeltas.resolved,
    addedWarningRows: warningRowDeltas.added,
    resolvedWarningRows: warningRowDeltas.resolved,
    hasHardRegression: issueDeltas.some((row) => row.delta > 0) || issueRowDeltas.added.length > 0,
    hasWarningIncrease: warningDeltas.some((row) => row.delta > 0) || warningRowDeltas.added.length > 0,
  };
}

function parseArgs(argv) {
  const opts = { before: null, after: null, json: false, jsonOutput: null, failOnRegression: false, failOnWarningIncrease: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--before') opts.before = argv[++i] ?? null;
    else if (arg === '--after') opts.after = argv[++i] ?? null;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--json-output') opts.jsonOutput = argv[++i] ?? null;
    else if (arg === '--fail-on-regression') opts.failOnRegression = true;
    else if (arg === '--fail-on-warning-increase') opts.failOnWarningIncrease = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/naver-seo-html-audit-compare.mjs --before old.json --after new.json [--json] [--json-output path] [--fail-on-regression] [--fail-on-warning-increase]');
      process.exit(0);
    }
  }
  if (!opts.before || !opts.after) throw new Error('--before and --after are required');
  if (opts.jsonOutput === '') throw new Error('--json-output requires a path');
  return opts;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function formatDelta(row) {
  const sign = row.delta > 0 ? '+' : '';
  return `${row.key}: ${row.before} → ${row.after} (${sign}${row.delta})`;
}

function formatRowSignals(row) {
  return `${row.url}: ${(row.signals || []).join(', ')}`;
}

function printRowSignalSample(label, rows, limit = 5) {
  if (rows.length === 0) return;
  console.log(`${label}: ${rows.length}`);
  for (const row of rows.slice(0, limit)) console.log(`- ${formatRowSignals(row)}`);
  if (rows.length > limit) console.log(`- ... ${rows.length - limit} more`);
}

export function printCompareReport(result) {
  console.log(`Naver SEO HTML audit compare: ${result.before.urlCount} → ${result.after.urlCount} URLs`);
  if (result.issueDeltas.length === 0) console.log('Issues: no change');
  else {
    console.log('Issue deltas:');
    for (const row of result.issueDeltas) console.log(`- ${formatDelta(row)}`);
  }
  if (result.warningDeltas.length === 0) console.log('Warnings: no change');
  else {
    console.log('Warning deltas:');
    for (const row of result.warningDeltas) console.log(`- ${formatDelta(row)}`);
  }
  if (result.urlDelta.added.length > 0) console.log(`Added URLs: ${result.urlDelta.added.length}`);
  if (result.urlDelta.removed.length > 0) console.log(`Removed URLs: ${result.urlDelta.removed.length}`);
  if (result.changedIssueRows.length > 0) console.log(`Changed issue rows: ${result.changedIssueRows.length}`);
  if (result.changedWarningRows.length > 0) console.log(`Changed warning rows: ${result.changedWarningRows.length}`);
  printRowSignalSample('Added issue rows', result.addedIssueRows);
  printRowSignalSample('Resolved issue rows', result.resolvedIssueRows);
  printRowSignalSample('Added warning rows', result.addedWarningRows);
  printRowSignalSample('Resolved warning rows', result.resolvedWarningRows);
  if (result.hasHardRegression) console.log('FAIL: hard SEO issue regression detected');
  else console.log('OK: no hard SEO issue regression');
  if (result.hasWarningIncrease) console.log('WARN: warning signal increased');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    const result = compareAuditArtifacts(await readJson(opts.before), await readJson(opts.after));
    if (opts.jsonOutput) await writeFile(opts.jsonOutput, `${JSON.stringify(result, null, 2)}\n`);
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else printCompareReport(result);
    if (opts.failOnRegression && result.hasHardRegression) process.exitCode = 1;
    if (opts.failOnWarningIncrease && result.hasWarningIncrease) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
