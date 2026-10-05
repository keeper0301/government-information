import { NextResponse } from "next/server";
import { authorizePrivateCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWordPressByBacklink } from "@/lib/wordpress/reconcile-preview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TimeoutRow = { blog_post_id: string; blog_post: { slug: string } };

/** Read-only late evidence check. Never retries WP POST or changes a DB row. */
export async function GET(request: Request) {
  const denied = authorizePrivateCronRequest(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const limitText = url.searchParams.get("limit") ?? "5";
  const offsetText = url.searchParams.get("offset") ?? "0";
  const limit = Number(limitText), offset = Number(offsetText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100 ||
      !/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)) {
    return NextResponse.json({ ok: false, reason: "invalid_page" }, { status: 400 });
  }

  const admin = createAdminClient();
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [timeouts, stale, held] = await Promise.all([
    admin.from("wordpress_publish_log")
      .select("blog_post_id,blog_post:blog_posts!inner(slug)", { count: "exact" })
      .eq("status", "failed")
      .is("wp_post_id", null)
      .like("error_message", "timeout %")
      .gte("failed_at", since48h)
      .order("failed_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin.from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("updated_at", staleBefore),
    admin.from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "skipped")
      .not("wp_post_id", "is", null),
  ]);
  if (timeouts.error || stale.error || held.error || !Array.isArray(timeouts.data)) {
    return NextResponse.json({ ok: false, reason: "audit_data_unavailable" }, { status: 503 });
  }
  const rows = timeouts.data as unknown as TimeoutRow[];
  const results = await Promise.all(rows.map(async (row) => {
    if (typeof row.blog_post?.slug !== "string") {
      return { blogPostId: row.blog_post_id, kind: "unavailable" as const, matches: [] as Array<{ id: number; url: string }> };
    }
    const preview = await findWordPressByBacklink(row.blog_post.slug, process.env.WP_API_URL ?? "");
    return { blogPostId: row.blog_post_id, kind: preview.kind, matches: preview.matches };
  }));
  const uniqueMatches = results.filter((r) => r.kind === "unique_match" && r.matches.length === 1)
    .map((r) => ({ blogPostId: r.blogPostId, wpPostId: r.matches[0].id, wpPostUrl: r.matches[0].url }));
  return NextResponse.json({
    ok: true,
    candidates: rows.length,
    totalRecentTimeouts: timeouts.count ?? 0,
    hasMore: offset + rows.length < (timeouts.count ?? 0),
    uniqueMatches,
    unresolved: results.length - uniqueMatches.length,
    kinds: results.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {}),
    staleClaims: stale.count ?? 0,
    heldDrafts: held.count ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
}
