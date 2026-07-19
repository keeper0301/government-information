// ============================================================
// Admin Instagram performance insights
// ============================================================
// MVP reads recent blog_posts + admin_actions.instagram_insights_collect and
// reduces latest snapshot per media id in app code. No migration needed.
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type InstagramPerformanceSummary = {
  window: "24h" | "7d";
  posts: number;
  reach: number;
  saved: number;
  shares: number;
  profileActivity: number;
  totalInteractions: number;
  saveRate: number;
  shareRate: number;
  profileActivityRate: number;
};

export type InstagramPostPerformance = {
  slug: string;
  title: string;
  category: string | null;
  mediaId: string;
  publishedAt: string;
  lastCollectedAt: string | null;
  reach: number;
  saved: number;
  shares: number;
  profileActivity: number;
  totalInteractions: number;
  cardHookType: string | null;
  cardHookLabel: string | null;
  signal: "good" | "weak" | "bad";
};

export type InstagramCategoryPerformance = {
  category: string;
  posts: number;
  reach: number;
  saved: number;
  shares: number;
};

export type InstagramHookPerformance = {
  hookType: string;
  hookLabel: string;
  posts: number;
  reach: number;
  saved: number;
  shares: number;
  saveRate: number;
  shareRate: number;
};

export type AdminInstagramInsights = {
  summary24h: InstagramPerformanceSummary;
  summary7d: InstagramPerformanceSummary;
  posts: InstagramPostPerformance[];
  categories: InstagramCategoryPerformance[];
  hooks: InstagramHookPerformance[];
};

type BlogPostRow = {
  slug: string;
  title: string;
  category: string | null;
  instagram_media_id: string | null;
  instagram_published_at: string | null;
};

type AdminActionRow = { action: string; created_at: string; details: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function signalFor(row: { reach: number; saved: number; shares: number; profileActivity: number }) {
  if (row.saved + row.shares >= 1 || row.profileActivity >= 1) return "good" as const;
  if (row.reach >= 30) return "weak" as const;
  return "bad" as const;
}

function emptySummary(window: "24h" | "7d"): InstagramPerformanceSummary {
  return {
    window,
    posts: 0,
    reach: 0,
    saved: 0,
    shares: 0,
    profileActivity: 0,
    totalInteractions: 0,
    saveRate: 0,
    shareRate: 0,
    profileActivityRate: 0,
  };
}

function summarize(window: "24h" | "7d", posts: InstagramPostPerformance[]): InstagramPerformanceSummary {
  const total = posts.reduce(
    (acc, post) => {
      acc.reach += post.reach;
      acc.saved += post.saved;
      acc.shares += post.shares;
      acc.profileActivity += post.profileActivity;
      acc.totalInteractions += post.totalInteractions;
      return acc;
    },
    { reach: 0, saved: 0, shares: 0, profileActivity: 0, totalInteractions: 0 },
  );
  return {
    window,
    posts: posts.length,
    ...total,
    saveRate: rate(total.saved, total.reach),
    shareRate: rate(total.shares, total.reach),
    profileActivityRate: rate(total.profileActivity, total.reach),
  };
}

export function buildAdminInstagramInsights(input: {
  posts: BlogPostRow[];
  actions: AdminActionRow[];
  nowMs?: number;
}): AdminInstagramInsights {
  const nowMs = input.nowMs ?? Date.now();
  const latestInsightByMedia = new Map<string, { createdAt: string; details: Record<string, unknown> }>();
  const hookByMedia = new Map<string, { type: string; label: string }>();

  for (const action of input.actions) {
    const details = asRecord(action.details);
    const mediaId = String(details.mediaId ?? details.media_id ?? "");
    if (!mediaId) continue;
    if (action.action === "instagram_insights_collect") {
      const prev = latestInsightByMedia.get(mediaId);
      if (!prev || prev.createdAt < action.created_at) {
        latestInsightByMedia.set(mediaId, { createdAt: action.created_at, details });
      }
    } else if (action.action === "instagram_publish_success") {
      hookByMedia.set(mediaId, {
        type: String(details.cardHookType ?? "unknown"),
        label: String(details.cardHookLabel ?? "미기록"),
      });
    }
  }

  const posts = input.posts
    .filter((post) => post.instagram_media_id && post.instagram_published_at)
    .map((post) => {
      const mediaId = post.instagram_media_id!;
      const insight = latestInsightByMedia.get(mediaId);
      const metrics = asRecord(insight?.details.metrics);
      const hook = hookByMedia.get(mediaId) ?? { type: "unknown", label: "미기록" };
      const row = {
        slug: post.slug,
        title: post.title,
        category: post.category,
        mediaId,
        publishedAt: post.instagram_published_at!,
        lastCollectedAt: insight?.createdAt ?? null,
        reach: toNumber(metrics.reach),
        saved: toNumber(metrics.saved),
        shares: toNumber(metrics.shares),
        profileActivity: toNumber(metrics.profile_activity),
        totalInteractions: toNumber(metrics.total_interactions),
        cardHookType: hook.type,
        cardHookLabel: hook.label,
        signal: "bad" as const,
      };
      return { ...row, signal: signalFor(row) };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const cutoff24h = nowMs - 24 * 60 * 60 * 1000;
  const posts24h = posts.filter((post) => Date.parse(post.publishedAt) >= cutoff24h);

  const categories = Array.from(
    posts.reduce((map, post) => {
      const key = post.category ?? "미분류";
      const row = map.get(key) ?? { category: key, posts: 0, reach: 0, saved: 0, shares: 0 };
      row.posts += 1;
      row.reach += post.reach;
      row.saved += post.saved;
      row.shares += post.shares;
      map.set(key, row);
      return map;
    }, new Map<string, InstagramCategoryPerformance>()).values(),
  ).sort((a, b) => b.posts - a.posts || b.reach - a.reach);

  const hooks = Array.from(
    posts.reduce((map, post) => {
      const key = post.cardHookType ?? "unknown";
      const row = map.get(key) ?? {
        hookType: key,
        hookLabel: post.cardHookLabel ?? "미기록",
        posts: 0,
        reach: 0,
        saved: 0,
        shares: 0,
        saveRate: 0,
        shareRate: 0,
      };
      row.posts += 1;
      row.reach += post.reach;
      row.saved += post.saved;
      row.shares += post.shares;
      row.saveRate = rate(row.saved, row.reach);
      row.shareRate = rate(row.shares, row.reach);
      map.set(key, row);
      return map;
    }, new Map<string, InstagramHookPerformance>()).values(),
  ).sort((a, b) => b.saved + b.shares - (a.saved + a.shares) || b.reach - a.reach);

  return {
    summary24h: posts24h.length ? summarize("24h", posts24h) : emptySummary("24h"),
    summary7d: posts.length ? summarize("7d", posts) : emptySummary("7d"),
    posts,
    categories,
    hooks,
  };
}

export const getAdminInstagramInsights = cache(async (): Promise<AdminInstagramInsights> => {
  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [postsRes, actionsRes] = await Promise.all([
    admin
      .from("blog_posts")
      .select("slug, title, category, instagram_media_id, instagram_published_at")
      .not("instagram_media_id", "is", null)
      .gte("instagram_published_at", since7d)
      .order("instagram_published_at", { ascending: false })
      .limit(100),
    admin
      .from("admin_actions")
      .select("action, created_at, details")
      .in("action", ["instagram_insights_collect", "instagram_publish_success"])
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (postsRes.error) throw new Error(`instagram posts query failed: ${postsRes.error.message}`);
  if (actionsRes.error) throw new Error(`instagram actions query failed: ${actionsRes.error.message}`);

  return buildAdminInstagramInsights({
    posts: (postsRes.data ?? []) as BlogPostRow[],
    actions: (actionsRes.data ?? []) as AdminActionRow[],
  });
});
