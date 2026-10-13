// Read-only audit of legacy ambiguous WordPress timeouts. No database or WP writes.
// Usage: npx tsx scripts/audit-wordpress-timeouts.ts <input.json> <output.jsonl> <offset> <limit<=20>
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { findWordPressByBacklink } from "../lib/wordpress/reconcile-preview";

type Row = {
  blog_post_id: string;
  status: string;
  wp_post_id: number | null;
  error_message: string | null;
  blog_post: { slug: string };
};

async function main() {
  const [inputPath, outputPath, startText, countText] = process.argv.slice(2);
  const start = Number(startText), count = Number(countText);
  if (!inputPath || !outputPath || !Number.isInteger(start) || start < 0 ||
      !Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error("usage: audit-wordpress-timeouts.ts <input.json> <output.jsonl> <offset>=0 <limit=1..20>");
  }
  const input: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  if (!Array.isArray(input)) throw new Error("input must be an array");
  const rows = input as Row[];
  const eligible = rows.filter((row) => row?.status === "failed" && row.wp_post_id == null &&
    row.error_message?.startsWith("timeout ") && typeof row.blog_post?.slug === "string" &&
    typeof row.blog_post_id === "string");
  const unique = [...new Map(eligible.map((row) => [row.blog_post_id, row])).values()];
  const seen = new Set<string>();
  if (existsSync(outputPath)) {
    for (const line of readFileSync(outputPath, "utf8").split("\n").filter(Boolean)) {
      const id = (JSON.parse(line) as { blogPostId?: string }).blogPostId;
      if (id) seen.add(id);
    }
  }
  const stats: Record<string, number> = {};
  let processed = 0;
  for (const row of unique.slice(start, start + count)) {
    if (seen.has(row.blog_post_id)) continue;
    const preview = await findWordPressByBacklink(
      row.blog_post.slug, "https://info.keeper0301.com/wp-json/wp/v2",
    );
    appendFileSync(outputPath, JSON.stringify({
      blogPostId: row.blog_post_id,
      kind: preview.kind,
      matchIds: preview.matches.map((m) => m.id),
      examined: preview.examined,
    }) + "\n", { mode: 0o600 });
    seen.add(row.blog_post_id);
    stats[preview.kind] = (stats[preview.kind] ?? 0) + 1;
    processed++;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.log(JSON.stringify({ eligible: unique.length, processed, recorded: seen.size, kinds: stats }));
}

main().catch((error: unknown) => {
  console.error("audit_failed", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
