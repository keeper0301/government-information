#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260520191551_user_policy_inbox_items.sql",
);
const envPath = join(root, ".env.local");
const json = process.argv.includes("--json");

function hasValidEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed);
}

function checkEnv() {
  if (!existsSync(envPath)) {
    return {
      checked: true,
      exists: false,
      parseRisk: false,
      invalidLines: [],
    };
  }

  const text = readFileSync(envPath, "utf8");
  const invalidLines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !hasValidEnvLine(line))
    .map(({ number, line }) => ({ number, preview: line.slice(0, 24) }));

  return {
    checked: true,
    exists: true,
    parseRisk: invalidLines.length > 0,
    invalidLines,
  };
}

function checkMigration() {
  const exists = existsSync(migrationPath);
  const sql = exists ? readFileSync(migrationPath, "utf8") : "";

  return {
    exists,
    hasTable: sql.includes("CREATE TABLE IF NOT EXISTS public.user_policy_inbox_items"),
    hasRls: sql.includes("ALTER TABLE public.user_policy_inbox_items ENABLE ROW LEVEL SECURITY"),
    hasPolicies:
      sql.includes("CREATE POLICY user_policy_inbox_items_select_own") &&
      sql.includes("CREATE POLICY user_policy_inbox_items_insert_own") &&
      sql.includes("CREATE POLICY user_policy_inbox_items_update_own") &&
      sql.includes("CREATE POLICY user_policy_inbox_items_delete_own"),
    hasAuthenticatedGrant: sql.includes(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_policy_inbox_items TO authenticated",
    ),
  };
}

const migration = checkMigration();
const env = checkEnv();
const ok =
  migration.exists &&
  migration.hasTable &&
  migration.hasRls &&
  migration.hasPolicies &&
  migration.hasAuthenticatedGrant &&
  !env.parseRisk;

const result = {
  ok,
  migration,
  env,
  next: ok
    ? "Supabase migration can be reviewed/applied."
    : "Fix migration/env checks before applying the policy inbox state migration.",
};

if (json) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  console.log("Policy inbox storage preflight");
  console.log(`ok: ${result.ok}`);
  console.log(`migration: ${JSON.stringify(result.migration)}`);
  console.log(`env: ${JSON.stringify(result.env)}`);
  console.log(`next: ${result.next}`);
}

process.exit(ok ? 0 : 1);
