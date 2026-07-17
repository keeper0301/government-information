#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const OFFICIAL = "전남광주통합특별시";
const LEGACY = new Set(["광주", "광주광역시", "광주시", "전남", "전라남도", "광주·전남", "광주전남", OFFICIAL]);
const TABLES = ["welfare_programs", "loan_programs", "alert_rules"];

function parseArgs(argv) {
  const args = new Map();
  for (const raw of argv) {
    const [key, value = "true"] = raw.replace(/^--/, "").split("=");
    args.set(key, value);
  }
  return {
    apply: args.get("apply") === "true",
    limit: Number(args.get("limit") ?? 500),
    table: args.get("table") ?? "all",
  };
}

function needsIntegratedTag(row) {
  const tags = Array.isArray(row.region_tags) ? row.region_tags : [];
  if (tags.includes(OFFICIAL)) return false;
  if (tags.some((tag) => LEGACY.has(tag))) return true;
  const region = typeof row.region === "string" ? row.region : "";
  return [...LEGACY].some((tag) => region.includes(tag));
}

function withIntegratedTag(row) {
  const tags = Array.isArray(row.region_tags) ? row.region_tags : [];
  return Array.from(new Set([...tags, OFFICIAL]));
}

async function fetchCandidates(supabase, table, limit) {
  const select = table === "alert_rules" ? "id, region_tags" : "id, region, region_tags";
  const orParts = [
    "region_tags.ov.{광주,전남,광주광역시,전라남도,광주·전남,광주전남}",
  ];
  if (table !== "alert_rules") {
    orParts.push("region.ilike.%광주%", "region.ilike.%전남%", "region.ilike.%전라남도%");
  }
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .or(orParts.join(","))
    .limit(limit);
  if (error) {
    if (error.code === "PGRST205" || error.message.includes("Could not find the table")) {
      return { rows: [], skipped: true, reason: error.message };
    }
    throw new Error(`${table} select failed: ${error.message}`);
  }
  return { rows: (data ?? []).filter(needsIntegratedTag), skipped: false, reason: null };
}

async function updateRows(supabase, table, rows) {
  let updated = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from(table)
      .update({ region_tags: withIntegratedTag(row) })
      .eq("id", row.id);
    if (error) throw new Error(`${table} update ${row.id} failed: ${error.message}`);
    updated += 1;
  }
  return updated;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(opts.limit) || opts.limit <= 0 || opts.limit > 5000) {
    throw new Error("--limit must be between 1 and 5000");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const tables = opts.table === "all" ? TABLES : [opts.table];
  for (const table of tables) {
    if (!TABLES.includes(table)) throw new Error(`Unsupported --table=${table}`);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary = [];
  for (const table of tables) {
    const result = await fetchCandidates(supabase, table, opts.limit);
    const rows = result.rows;
    const sample = rows.slice(0, 5).map((row) => ({ id: row.id, before: row.region_tags ?? [], after: withIntegratedTag(row) }));
    let updated = 0;
    if (opts.apply && rows.length > 0) updated = await updateRows(supabase, table, rows);
    summary.push({ table, candidates: rows.length, updated, skipped: result.skipped, reason: result.reason, sample });
  }

  console.log(JSON.stringify({ mode: opts.apply ? "apply" : "dry-run", officialTag: OFFICIAL, limit: opts.limit, summary }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
