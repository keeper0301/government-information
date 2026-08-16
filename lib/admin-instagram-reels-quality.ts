// ============================================================
// Admin Instagram Reels quality dashboard data
// ============================================================
// Read-only reducer for /admin/instagram. It surfaces render/publish
// candidates, quality-gate reasons, audio/TTS evidence, daily cap and
// retry exclusion state without mutating DB or calling external APIs.
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { scoreReelCandidate } from "@/lib/instagram/reel-quality";

const REEL_RENDER_VERSION = "article-source-labels-v19";

export type ReelsDashboardPostRow = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  published_at: string | null;
  admin_review_required: boolean | null;
  instagram_reel_video_url: string | null;
  instagram_reel_published_at: string | null;
  instagram_reel_media_id: string | null;
  instagram_reel_error: string | null;
  instagram_reel_attempt_count: number | null;
  instagram_reel_render_attempt_count: number | null;
};

type AdminActionRow = {
  action: string;
  created_at: string;
  details: unknown;
};

export type ReelsCandidateStatus =
  | "published"
  | "ready_to_publish"
  | "needs_render"
  | "quality_blocked"
  | "retry_excluded"
  | "invalid_video_url";

export type ReelsAudioStatus = "verified" | "unknown" | "missing";

export type InstagramReelsQualityCandidate = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  status: ReelsCandidateStatus;
  publishedAt: string | null;
  mediaId: string | null;
  videoUrl: string | null;
  currentRenderVersion: boolean;
  externalQualityApproved: boolean;
  reelQualityApproved: boolean;
  reelScore: number;
  reasons: string[];
  renderAttemptCount: number;
  publishAttemptCount: number;
  retryExcluded: boolean;
  lastError: string | null;
  latestRenderAt: string | null;
  latestPublishAt: string | null;
  latestSkipReason: string | null;
  ttsAudioStatus: ReelsAudioStatus;
  durationSeconds: number | null;
};

export type InstagramReelsQualityDashboard = {
  generatedAt: string;
  safetyLine: string;
  renderEnabled: boolean;
  publishEnabled: boolean;
  dailyCap: number;
  todayPublished: number;
  dailyCapRemaining: number;
  frozenHookCtaWeak: boolean;
  latestJudgementAt: string | null;
  latestJudgementStatus: string | null;
  latestJudgementNextAction: string | null;
  counts: {
    recent: number;
    published: number;
    readyToPublish: number;
    needsRender: number;
    qualityBlocked: number;
    retryExcluded: number;
    invalidVideoUrl: number;
  };
  candidates: InstagramReelsQualityCandidate[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function currentVideoUrl(videoUrl: string | null): boolean {
  return typeof videoUrl === "string" && videoUrl.includes(`/${REEL_RENDER_VERSION}/`);
}

function publicVideoUrlOk(videoUrl: string | null): boolean {
  try {
    return !!videoUrl && new URL(videoUrl).protocol === "https:" && currentVideoUrl(videoUrl);
  } catch {
    return false;
  }
}

function kstMidnightIso(nowMs: number): string {
  const nowUtc = new Date(nowMs);
  const kstMidnight = new Date(nowUtc);
  kstMidnight.setUTCHours(15, 0, 0, 0);
  if (nowUtc.getUTCHours() < 15) kstMidnight.setUTCDate(kstMidnight.getUTCDate() - 1);
  return kstMidnight.toISOString();
}

function latestActionBySlug(actions: AdminActionRow[], actionName: string): Map<string, AdminActionRow> {
  const map = new Map<string, AdminActionRow>();
  for (const action of actions) {
    if (action.action !== actionName) continue;
    const slug = asString(asRecord(action.details).slug);
    if (!slug) continue;
    const prev = map.get(slug);
    if (!prev || prev.created_at < action.created_at) map.set(slug, action);
  }
  return map;
}

function latestSkipReason(actions: AdminActionRow[], slug: string): string | null {
  const skip = actions.find((action) => {
    if (action.action !== "instagram_reel_publish_skipped" && action.action !== "instagram_reel_render_skipped") return false;
    const details = asRecord(action.details);
    return asString(details.slug) === slug || !asString(details.slug);
  });
  return skip ? asString(asRecord(skip.details).reason) : null;
}

function latestJudgement(actions: AdminActionRow[], nowMs: number): {
  at: string | null;
  status: string | null;
  nextAction: string | null;
  frozen: boolean;
} {
  const action = actions.find((row) => row.action === "instagram_insights_judgement");
  const details = asRecord(action?.details);
  const judgement = asRecord(details.judgement);
  const management = asRecord(details.management);
  const status = asString(judgement.status);
  const ageHours = action ? (nowMs - new Date(action.created_at).getTime()) / 3_600_000 : null;
  return {
    at: action?.created_at ?? null,
    status,
    nextAction: asString(management.nextAction),
    frozen: status === "hook_cta_weak" && ageHours !== null && Number.isFinite(ageHours) && ageHours <= 72,
  };
}

function candidateStatus(input: {
  publishedAt: string | null;
  retryExcluded: boolean;
  qualityBlocked: boolean;
  videoUrl: string | null;
}): ReelsCandidateStatus {
  if (input.publishedAt) return "published";
  if (input.retryExcluded) return "retry_excluded";
  if (input.qualityBlocked) return "quality_blocked";
  if (!input.videoUrl) return "needs_render";
  if (!publicVideoUrlOk(input.videoUrl)) return "invalid_video_url";
  return "ready_to_publish";
}

export function buildInstagramReelsQualityDashboard(input: {
  posts: ReelsDashboardPostRow[];
  actions: AdminActionRow[];
  nowMs?: number;
  env?: Record<string, string | undefined>;
  todayPublished?: number;
}): InstagramReelsQualityDashboard {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const env = input.env ?? process.env;
  const dailyCap = intEnv(env.INSTAGRAM_REELS_DAILY_CAP, 2);
  const midnight = kstMidnightIso(nowMs);
  const todayPublished = input.todayPublished ?? input.posts.filter(
    (post) => post.instagram_reel_published_at && post.instagram_reel_published_at >= midnight,
  ).length;

  const orderedActions = [...input.actions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const renderSuccessBySlug = latestActionBySlug(orderedActions, "instagram_reel_render_success");
  const publishSuccessBySlug = latestActionBySlug(orderedActions, "instagram_reel_publish_success");
  const judgement = latestJudgement(orderedActions, nowMs);

  const candidates = input.posts.map((post): InstagramReelsQualityCandidate => {
    const external = assessExternalPublishQuality(post);
    const reel = scoreReelCandidate(post);
    const renderAttemptCount = post.instagram_reel_render_attempt_count ?? 0;
    const publishAttemptCount = post.instagram_reel_attempt_count ?? 0;
    const hasCurrentVideo = currentVideoUrl(post.instagram_reel_video_url);
    const renderRetryExcluded = !post.instagram_reel_published_at && !hasCurrentVideo && renderAttemptCount >= 3;
    const publishRetryExcluded = !post.instagram_reel_published_at && hasCurrentVideo && publishAttemptCount >= 3;
    const retryExcluded = renderRetryExcluded || publishRetryExcluded;
    const qualityBlocked = post.admin_review_required !== false || !external.approved || !reel.approved;
    const renderAction = renderSuccessBySlug.get(post.slug);
    const renderDetails = asRecord(renderAction?.details);
    const publishAction = publishSuccessBySlug.get(post.slug);
    const status = candidateStatus({
      publishedAt: post.instagram_reel_published_at,
      retryExcluded,
      qualityBlocked,
      videoUrl: post.instagram_reel_video_url,
    });
    const ttsAudioStatus: ReelsAudioStatus = post.instagram_reel_published_at || renderAction
      ? "verified"
      : hasCurrentVideo
        ? "unknown"
        : "missing";

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      category: post.category,
      status,
      publishedAt: post.instagram_reel_published_at,
      mediaId: post.instagram_reel_media_id,
      videoUrl: post.instagram_reel_video_url,
      currentRenderVersion: hasCurrentVideo,
      externalQualityApproved: external.approved,
      reelQualityApproved: reel.approved,
      reelScore: reel.score,
      reasons: [...external.reasons, ...reel.reasons],
      renderAttemptCount,
      publishAttemptCount,
      retryExcluded,
      lastError: post.instagram_reel_error,
      latestRenderAt: renderAction?.created_at ?? null,
      latestPublishAt: publishAction?.created_at ?? post.instagram_reel_published_at,
      latestSkipReason: latestSkipReason(orderedActions, post.slug),
      ttsAudioStatus,
      durationSeconds: asNumber(renderDetails.duration_seconds),
    };
  }).sort((a, b) => {
    const rank: Record<ReelsCandidateStatus, number> = {
      ready_to_publish: 0,
      needs_render: 1,
      quality_blocked: 2,
      invalid_video_url: 3,
      retry_excluded: 4,
      published: 5,
    };
    return rank[a.status] - rank[b.status] || b.reelScore - a.reelScore;
  });

  return {
    generatedAt: nowIso,
    safetyLine: "읽기 전용: DB 수정·외부 게시·Graph API 호출 없이 blog_posts/admin_actions만 조회합니다.",
    renderEnabled: env.INSTAGRAM_REELS_RENDER_ENABLED === "true",
    publishEnabled: env.INSTAGRAM_REELS_AUTO_ENABLED === "true",
    dailyCap,
    todayPublished,
    dailyCapRemaining: Math.max(0, dailyCap - todayPublished),
    frozenHookCtaWeak: env.INSTAGRAM_REELS_FREEZE_ON_WEAK_CTA === "false" ? false : judgement.frozen,
    latestJudgementAt: judgement.at,
    latestJudgementStatus: judgement.status,
    latestJudgementNextAction: judgement.nextAction,
    counts: {
      recent: candidates.length,
      published: candidates.filter((item) => item.status === "published").length,
      readyToPublish: candidates.filter((item) => item.status === "ready_to_publish").length,
      needsRender: candidates.filter((item) => item.status === "needs_render").length,
      qualityBlocked: candidates.filter((item) => item.status === "quality_blocked").length,
      retryExcluded: candidates.filter((item) => item.status === "retry_excluded").length,
      invalidVideoUrl: candidates.filter((item) => item.status === "invalid_video_url").length,
    },
    candidates,
  };
}

export const getAdminInstagramReelsQualityDashboard = cache(async (): Promise<InstagramReelsQualityDashboard> => {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const since30d = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const kstMidnight = kstMidnightIso(nowMs);

  const [postsRes, actionsRes, todayPublishedRes] = await Promise.all([
    admin
      .from("blog_posts")
      .select("id, slug, title, content, meta_description, category, tags, published_at, admin_review_required, instagram_reel_video_url, instagram_reel_published_at, instagram_reel_media_id, instagram_reel_error, instagram_reel_attempt_count, instagram_reel_render_attempt_count")
      .not("published_at", "is", null)
      .gte("published_at", since30d)
      .order("published_at", { ascending: false })
      .limit(60),
    admin
      .from("admin_actions")
      .select("action, created_at, details")
      .in("action", [
        "instagram_reel_publish_success",
        "instagram_reel_publish_fail",
        "instagram_reel_publish_skipped",
        "instagram_reel_render_success",
        "instagram_reel_render_fail",
        "instagram_reel_render_skipped",
        "instagram_insights_judgement",
      ])
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .gte("instagram_reel_published_at", kstMidnight),
  ]);

  if (postsRes.error) throw new Error(`instagram reels posts query failed: ${postsRes.error.message}`);
  if (actionsRes.error) throw new Error(`instagram reels actions query failed: ${actionsRes.error.message}`);
  if (todayPublishedRes.error) throw new Error(`instagram reels daily cap query failed: ${todayPublishedRes.error.message}`);

  return buildInstagramReelsQualityDashboard({
    posts: (postsRes.data ?? []) as ReelsDashboardPostRow[],
    actions: (actionsRes.data ?? []) as AdminActionRow[],
    nowMs,
    todayPublished: todayPublishedRes.count ?? 0,
  });
});
