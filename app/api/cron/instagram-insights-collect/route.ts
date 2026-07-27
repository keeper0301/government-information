// ============================================================
// Instagram normal-post insights collection cron
// ============================================================
// Read-only Graph API collection + admin audit log. This does not publish or
// mutate blog_posts. It records compact metrics in admin_actions so ops can
// compare reach/saves/shares/profile activity after publish volume increases.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { loadValidToken } from "@/lib/instagram/oauth";
import { collectInstagramMediaInsights } from "@/lib/instagram/insights";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type PublishedInstagramPost = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  instagram_media_id: string;
  instagram_published_at: string;
};

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDryRunRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("dry") === "1" || url.searchParams.get("dryRun") === "1";
}

function summarizeMetrics(metrics: Record<string, number>) {
  return {
    reach: metrics.reach ?? 0,
    saved: metrics.saved ?? 0,
    shares: metrics.shares ?? 0,
    profile_activity: metrics.profile_activity ?? 0,
    total_interactions: metrics.total_interactions ?? 0,
  };
}

function judgePerformance(results: Array<{ metrics: ReturnType<typeof summarizeMetrics>; publishedAt: string }>) {
  const count = results.length;
  const totals = results.reduce(
    (acc, row) => {
      acc.reach += row.metrics.reach;
      acc.saved += row.metrics.saved;
      acc.shares += row.metrics.shares;
      acc.profile_activity += row.metrics.profile_activity;
      acc.total_interactions += row.metrics.total_interactions;
      if (row.metrics.saved > 0) acc.postsWithSaves += 1;
      if (row.metrics.shares > 0) acc.postsWithShares += 1;
      if (row.metrics.profile_activity > 0) acc.postsWithProfileActivity += 1;
      return acc;
    },
    {
      reach: 0,
      saved: 0,
      shares: 0,
      profile_activity: 0,
      total_interactions: 0,
      postsWithSaves: 0,
      postsWithShares: 0,
      postsWithProfileActivity: 0,
    },
  );
  const sortedPublishedAt = results.map((row) => row.publishedAt).sort();
  const avgReach = count > 0 ? Number((totals.reach / count).toFixed(2)) : 0;
  const saveRate = totals.reach > 0 ? Number((totals.saved / totals.reach).toFixed(4)) : 0;
  const shareRate = totals.reach > 0 ? Number((totals.shares / totals.reach).toFixed(4)) : 0;
  const status =
    count === 0
      ? "no_recent_posts"
      : totals.reach === 0
        ? "no_reach_signal"
        : totals.saved === 0 && totals.shares === 0 && totals.profile_activity === 0
          ? "hook_cta_weak"
          : totals.saved + totals.shares > 0
            ? "save_share_signal"
            : "watch_profile_activity";
  const recommendation =
    status === "save_share_signal"
      ? "저장/공유 신호가 있으니 해당 hook/category를 확대 후보로 본다."
      : status === "hook_cta_weak"
        ? "도달은 있지만 저장·공유·프로필 활동이 없다. 카드 1 저장/공유 이유와 댓글 CTA를 계속 개선해야 한다."
        : status === "no_reach_signal"
          ? "도달 자체가 없다. 볼륨 확대보다 주제 선택·표지 hook부터 손본다."
          : "표본을 더 모은 뒤 6h/24h로 다시 판단한다.";
  return {
    status,
    recommendation,
    count,
    avgReach,
    saveRate,
    shareRate,
    oldestPublishedAt: sortedPublishedAt[0] ?? null,
    newestPublishedAt: sortedPublishedAt.at(-1) ?? null,
    ...totals,
  };
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const dryRun = isDryRunRequest(request);
  const limit = Math.min(
    parsePositiveInt(url.searchParams.get("limit") ?? process.env.INSTAGRAM_INSIGHTS_COLLECT_LIMIT, 30),
    50,
  );
  const days = Math.min(
    parsePositiveInt(url.searchParams.get("days") ?? process.env.INSTAGRAM_INSIGHTS_LOOKBACK_DAYS, 3),
    14,
  );

  const admin = createAdminClient();
  const creds = await loadValidToken(admin);
  if (!creds) {
    return NextResponse.json({ status: "not_configured", dryRun });
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("blog_posts")
    .select("id, slug, title, category, instagram_media_id, instagram_published_at")
    .not("instagram_media_id", "is", null)
    .gte("instagram_published_at", since)
    .order("instagram_published_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "DB query failed", detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PublishedInstagramPost[];
  const results = [];
  for (const row of rows) {
    const insight = await collectInstagramMediaInsights(row.instagram_media_id, creds.token);
    const metrics = summarizeMetrics(insight.metrics);
    const result = {
      postId: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      mediaId: row.instagram_media_id,
      publishedAt: row.instagram_published_at,
      metrics,
      requestedMetrics: insight.requestedMetrics,
      errorCount: insight.errors.length,
      errors: insight.errors.slice(0, 2),
    };
    results.push(result);

    if (!dryRun) {
      await logAdminAction({
        actorId: null,
        action: "instagram_insights_collect",
        details: result,
      });
    }
  }

  const totals = results.reduce(
    (acc, row) => {
      acc.reach += row.metrics.reach;
      acc.saved += row.metrics.saved;
      acc.shares += row.metrics.shares;
      acc.profile_activity += row.metrics.profile_activity;
      acc.total_interactions += row.metrics.total_interactions;
      return acc;
    },
    { reach: 0, saved: 0, shares: 0, profile_activity: 0, total_interactions: 0 },
  );

  return NextResponse.json({
    status: "ok",
    dryRun,
    collectedAt: new Date().toISOString(),
    lookbackDays: days,
    requestedLimit: limit,
    collectedCount: results.length,
    totals,
    judgement: judgePerformance(results),
    results,
  });
}
