import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { checkThreadsCredentials } from "@/lib/sns/credential-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminActionRow = {
  created_at?: string | null;
  details?: {
    id?: string;
    title?: string;
    results?: Array<{ channel?: string; ok?: boolean; id?: string; reason?: string }>;
  } | null;
};

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  published_at?: string | null;
  admin_review_required?: boolean | null;
};

async function safeThreadsIdentity(): Promise<{ username: string | null; ok: boolean; reason: string | null }> {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !token) return { username: null, ok: false, reason: "missing_credentials" };
  try {
    const url = `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}?fields=username&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { username: null, ok: false, reason: `http_${res.status}` };
    const data = (await res.json().catch(() => null)) as { username?: string } | null;
    return { username: data?.username ?? null, ok: Boolean(data?.username), reason: data?.username ? null : "missing_username" };
  } catch (error) {
    return { username: null, ok: false, reason: `network: ${(error as Error).message.slice(0, 80)}` };
  }
}

function threadsResult(row: AdminActionRow) {
  return row.details?.results?.find((result) => result.channel === "threads") ?? null;
}

function summarizeThreadsRuns(rows: AdminActionRow[]) {
  const threadRows = rows
    .map((row) => ({ created_at: row.created_at ?? null, details: row.details ?? null, result: threadsResult(row) }))
    .filter((row) => row.result);
  const successful = threadRows.filter((row) => row.result?.ok === true);
  const failed = threadRows.filter((row) => row.result?.ok !== true);
  return {
    totalLogged: threadRows.length,
    successCount: successful.length,
    failureCount: failed.length,
    lastSuccessAt: successful[0]?.created_at ?? null,
    lastAttemptAt: threadRows[0]?.created_at ?? null,
    recent: threadRows.slice(0, 10).map((row) => ({
      created_at: row.created_at,
      post_id: row.details?.id ?? null,
      title: row.details?.title ?? null,
      ok: row.result?.ok ?? false,
      reason: row.result?.ok ? null : (row.result?.reason ?? "unknown"),
      hasPlatformId: Boolean(row.result?.id),
    })),
  };
}

async function run() {
  const admin = createAdminClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [threadsCredential, threadsIdentity, recentPostsRes, eligiblePostsRes, actionsRes] = await Promise.all([
    checkThreadsCredentials(),
    safeThreadsIdentity(),
    admin
      .from("blog_posts")
      .select("id,title,slug,published_at,admin_review_required")
      .gte("published_at", since7d)
      .order("published_at", { ascending: false })
      .limit(10),
    admin
      .from("blog_posts")
      .select("id,title,slug,published_at,admin_review_required")
      .gte("published_at", since24h)
      .eq("admin_review_required", false)
      .order("published_at", { ascending: false })
      .limit(10),
    admin
      .from("admin_actions")
      .select("created_at,details")
      .eq("action", "sns_publish_run")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const recentPosts = (recentPostsRes.data ?? []) as BlogPostRow[];
  const eligiblePosts = (eligiblePostsRes.data ?? []) as BlogPostRow[];
  const actions = (actionsRes.data ?? []) as AdminActionRow[];
  const threadsRuns = summarizeThreadsRuns(actions);
  const env = {
    THREADS_AUTO_PUBLISH_ENABLED: process.env.THREADS_AUTO_PUBLISH_ENABLED ?? "default_enabled",
    threadsAutoPublishEnabled: process.env.THREADS_AUTO_PUBLISH_ENABLED !== "false",
    THREADS_DAILY_CAP: process.env.THREADS_DAILY_CAP ?? null,
    THREADS_MIN_HOURS_BETWEEN_POSTS: process.env.THREADS_MIN_HOURS_BETWEEN_POSTS ?? null,
  };

  const blockers: string[] = [];
  if (!env.threadsAutoPublishEnabled) blockers.push("threads_auto_publish_disabled");
  if (!threadsCredential.ok) blockers.push(`threads_credentials_${threadsCredential.reason ?? "not_ok"}`);
  if (eligiblePosts.length === 0) blockers.push("no_eligible_blog_posts_in_24h");
  if (threadsRuns.successCount > 0 && threadsRuns.recent[0]?.reason === "threads_daily_cap_reached") {
    blockers.push("threads_daily_cap_reached");
  }
  if (threadsRuns.recent[0]?.reason === "threads_min_interval") blockers.push("threads_min_interval");

  return NextResponse.json({
    ok: blockers.length === 0,
    mutation: "none_read_only",
    checkedAt: new Date().toISOString(),
    env,
    threadsCredential: {
      ready: threadsCredential.ready,
      checked: threadsCredential.checked,
      ok: threadsCredential.ok,
      reason: threadsCredential.reason,
      httpStatus: threadsCredential.httpStatus ?? null,
      missing: threadsCredential.missing,
    },
    threadsIdentity,
    blockers,
    recentPosts: {
      last7dCountSample: recentPosts.length,
      eligible24hCountSample: eligiblePosts.length,
      eligible24hSample: eligiblePosts.slice(0, 5).map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        published_at: post.published_at ?? null,
      })),
      recent7dSample: recentPosts.slice(0, 5).map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        published_at: post.published_at ?? null,
        admin_review_required: post.admin_review_required ?? null,
      })),
    },
    threadsRuns,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
