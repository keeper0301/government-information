#!/usr/bin/env node
// Guardrail: sensitive API route groups must keep an explicit auth gate.
// This is a lightweight static audit. It does not prove auth correctness, but it
// prevents new admin/cron/agent/internal route files from being added with no
// recognizable auth marker at all.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

const ruleSets = [
  {
    name: "admin routes",
    match: (rel) => rel.startsWith("app/api/admin/"),
    // Normal admin UI routes use requireAdminUser/isAdminUser. A few ingestion
    // receivers live under /admin but are machine-to-machine and use dedicated
    // shared secrets instead.
    auth: /(requireAdminUser|isAdminUser|admin-auth|IMPORT_PRESS_API_KEY|PC_RUNNER_SECRET)/,
  },
  {
    name: "cron routes",
    match: (rel) => rel.startsWith("app/api/cron/"),
    auth: /(authorizeCronRequest|authorizePrivateCronRequest|authorizeOptionalCronRequest|isPrivateCronRequestAuthorized|CRON_SECRET)/,
  },
  {
    name: "agent mutating routes",
    match: (rel) => rel.startsWith("app/api/agent/") && !rel.startsWith("app/api/agent/health/"),
    auth: /(authorizeCronRequest|authorizePrivateCronRequest|isPrivateCronRequestAuthorized|CRON_SECRET|AGENT_[A-Z0-9_]*SECRET|AGENT_[A-Z0-9_]*TOKEN)/,
  },
  {
    name: "internal routes",
    match: (rel) => rel.startsWith("app/api/internal/"),
    auth: /(authorizeCronRequest|authorizePrivateCronRequest|isPrivateCronRequestAuthorized|CRON_SECRET|IMPORT_PRESS_API_KEY|safeKeyEqual)/,
  },
];

const failures = [];
const counts = new Map(ruleSets.map((r) => [r.name, 0]));

for (const file of walk(API_ROOT)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  for (const rule of ruleSets) {
    if (!rule.match(rel)) continue;
    counts.set(rule.name, counts.get(rule.name) + 1);
    if (!rule.auth.test(source)) {
      failures.push({ rule: rule.name, file: rel });
    }
  }
}

if (failures.length > 0) {
  console.error("API route auth audit failed. Add an explicit auth gate or update tools/audit-api-route-auth.mjs with a documented exception.");
  for (const failure of failures) {
    console.error(`- [${failure.rule}] ${failure.file}`);
  }
  process.exit(1);
}

console.log("API route auth audit passed:");
for (const [name, count] of counts) {
  console.log(`- ${name}: ${count} route file(s)`);
}
