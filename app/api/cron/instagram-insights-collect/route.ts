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
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { resolveInstagramCardHook } from "@/lib/instagram/card-hook";

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

type InsightResultForJudgement = {
  category: string | null;
  cardHook: ReturnType<typeof resolveInstagramCardHook>;
  metrics: ReturnType<typeof summarizeMetrics>;
  publishedAt: string;
};

function buildPerformanceBreakdown(results: InsightResultForJudgement[]) {
  function reduceBy<T extends "category" | "cardHook">(kind: T) {
    const rows = new Map<string, { key: string; label: string; posts: number; reach: number; saved: number; shares: number; profile_activity: number; saveRate: number; shareRate: number }>();
    for (const row of results) {
      const key = kind === "category" ? row.category ?? "미분류" : row.cardHook.type;
      const label = kind === "category" ? key : row.cardHook.label;
      const acc = rows.get(key) ?? { key, label, posts: 0, reach: 0, saved: 0, shares: 0, profile_activity: 0, saveRate: 0, shareRate: 0 };
      acc.posts += 1;
      acc.reach += row.metrics.reach;
      acc.saved += row.metrics.saved;
      acc.shares += row.metrics.shares;
      acc.profile_activity += row.metrics.profile_activity;
      acc.saveRate = acc.reach > 0 ? Number((acc.saved / acc.reach).toFixed(4)) : 0;
      acc.shareRate = acc.reach > 0 ? Number((acc.shares / acc.reach).toFixed(4)) : 0;
      rows.set(key, acc);
    }
    return Array.from(rows.values()).sort((a, b) => b.posts - a.posts || b.reach - a.reach);
  }

  const categories = reduceBy("category");
  const hooks = reduceBy("cardHook");
  const dominantCategory = categories[0] ?? null;
  const categorySkew = dominantCategory ? Number((dominantCategory.posts / Math.max(results.length, 1)).toFixed(2)) : 0;
  return {
    categories,
    hooks,
    dominantCategory: dominantCategory?.key ?? null,
    categorySkew,
    categorySkewRisk: categorySkew >= 0.45,
    topicMixRecommendation:
      categorySkew >= 0.45
        ? `최근 표본이 ${dominantCategory?.key}에 쏠렸다. 다음 publish candidate는 청년·주거·육아·노년·교육 쪽을 우선 스캔한다.`
        : "카테고리 쏠림은 낮다. hook/CTA 신호를 계속 본다.",
  };
}

function judgePerformance(results: InsightResultForJudgement[]) {
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

function resolveAutoManagement(judgement: ReturnType<typeof judgePerformance>, breakdown: ReturnType<typeof buildPerformanceBreakdown>) {
  const needsAction = (["hook_cta_weak", "no_reach_signal"].includes(judgement.status) && judgement.count >= 10) || (breakdown.categorySkewRisk && judgement.count >= 10);
  const severity = judgement.status === "no_reach_signal" ? "action" : needsAction ? "watch" : "ok";
  const nextAction =
    judgement.status === "save_share_signal"
      ? "저장/공유가 발생한 hook/category를 다음 발행 후보 선별과 카드 hook 확대 후보로 기록한다."
      : judgement.status === "hook_cta_weak"
        ? `발행량 확대를 멈추고 카드 1 저장/공유 hook, keeper.punch 댓글 키워드, 주제 mix를 우선 개선한다. ${breakdown.topicMixRecommendation}`
        : judgement.status === "no_reach_signal"
          ? "발행량/빈도 변경보다 주제 선택과 첫 카드 hook을 먼저 교체한다."
          : "다음 6h/24h 표본까지 자동 관찰한다.";
  return {
    mode: "auto_judgement_audit_and_alert",
    severity,
    needsAction,
    nextAction,
    alertEligible: needsAction,
    categorySkewRisk: breakdown.categorySkewRisk,
    dominantCategory: breakdown.dominantCategory,
  };
}

function buildOpsMessage(judgement: ReturnType<typeof judgePerformance>, management: ReturnType<typeof resolveAutoManagement>) {
  return [
    `상태: ${judgement.status}`,
    `표본: ${judgement.count}개 / reach ${judgement.reach} / avg ${judgement.avgReach}`,
    `저장 ${judgement.saved} · 공유 ${judgement.shares} · 프로필활동 ${judgement.profile_activity}`,
    `saveRate ${judgement.saveRate} · shareRate ${judgement.shareRate}`,
    `판단: ${judgement.recommendation}`,
    `자동 다음 행동: ${management.nextAction}`,
    "안전선: 이 cron은 성과 수집·audit·알림만 하고 발행/DB blog_posts 변경은 하지 않음.",
  ].join("\n");
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
    const cardHook = resolveInstagramCardHook({ title: row.title, category: row.category });
    const result = {
      postId: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      cardHook,
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
  const judgement = judgePerformance(results);
  const breakdown = buildPerformanceBreakdown(results);
  const management = resolveAutoManagement(judgement, breakdown);
  let alertResult = null;
  if (!dryRun) {
    await logAdminAction({
      actorId: null,
      action: "instagram_insights_judgement",
      details: { judgement, management, breakdown },
    });
    if (management.alertEligible) {
      alertResult = await sendOpsAlertTelegram({
        subject: `[Keepioo Instagram] 성과 병목 자동판정: ${judgement.status}`,
        message: buildOpsMessage(judgement, management),
      });
    }
  }

  return NextResponse.json({
    status: "ok",
    dryRun,
    collectedAt: new Date().toISOString(),
    lookbackDays: days,
    requestedLimit: limit,
    collectedCount: results.length,
    totals,
    judgement,
    breakdown,
    management,
    alertResult,
    results,
  });
}
