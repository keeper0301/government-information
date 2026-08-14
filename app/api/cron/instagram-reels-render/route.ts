// ============================================================
// 인스타 Reels MP4 생성 cron — blog_posts 1건을 세로 영상으로 렌더링 후 public URL 저장
// ============================================================
// 실제 릴스 게시와 분리된 준비 단계. 생성된 URL 은 instagram-reels-publish cron 이 사용한다.
// ============================================================

import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { renderReelVideo } from "@/lib/instagram/reel-video-render";
import { scoreReelCandidate } from "@/lib/instagram/reel-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RenderStatus =
  | "disabled"
  | "no_pending"
  | "quality_review_pending"
  | "quality_gate_rejected"
  | "ready"
  | "attempt_claim_failed";

type RenderCandidate = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  admin_review_required: boolean | null;
  instagram_reel_video_url: string | null;
  instagram_reel_render_attempt_count: number | null;
};

const REEL_RENDER_VERSION = "article-story-v7";

function isDryRunRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.searchParams.get("dry") === "1" ||
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("status") === "1"
  );
}

function dryResponse(status: RenderStatus, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ dryRun: true, status, ...extra });
}

function renderEnabled(): boolean {
  return process.env.INSTAGRAM_REELS_RENDER_ENABLED === "true";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
}

function storagePath(slug: string): string {
  // Supabase Storage key 는 ASCII-safe 로 제한한다. 한글 slug 는 일부 URL/path validator 에서 invalid key 처리될 수 있음.
  const asciiSlug = slug
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  const safeSlug = asciiSlug || `post-${Buffer.from(slug).toString("hex").slice(0, 16)}`;
  const month = new Date().toISOString().slice(0, 7);
  return `${month}/${REEL_RENDER_VERSION}/${Date.now()}-${safeSlug}.mp4`;
}

function isCurrentReelVideoUrl(videoUrl: string | null): boolean {
  return typeof videoUrl === "string" && videoUrl.includes(`/${REEL_RENDER_VERSION}/`);
}

async function safeLogSkip(reason: string, extra: Record<string, unknown> = {}) {
  try {
    await logAdminAction({
      actorId: null,
      action: "instagram_reel_render_skipped",
      details: { reason, ...extra },
    });
  } catch {
    // audit 실패는 renderer 응답을 막지 않는다.
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const dryRun = isDryRunRequest(request);

  if (!renderEnabled()) {
    if (dryRun) return dryResponse("disabled", { env: "INSTAGRAM_REELS_RENDER_ENABLED" });
    await safeLogSkip("disabled", { env: "INSTAGRAM_REELS_RENDER_ENABLED" });
    return NextResponse.json({ status: "disabled", message: "INSTAGRAM_REELS_RENDER_ENABLED=true 일 때만 Reels 영상 생성" });
  }

  const admin = createAdminClient();
  const { data: posts, error: queryErr } = await admin
    .from("blog_posts")
    .select("id, slug, title, content, meta_description, category, tags, admin_review_required, instagram_reel_video_url, instagram_reel_render_attempt_count")
    .not("published_at", "is", null)
    .is("instagram_reel_published_at", null)
    .eq("admin_review_required", false)
    .lt("instagram_reel_render_attempt_count", 3)
    .order("published_at", { ascending: true })
    .limit(20)
    .returns<RenderCandidate[]>();

  if (queryErr) {
    await safeLogSkip("query_failed", { error: queryErr.message.slice(0, 200) });
    return NextResponse.json({ error: "DB query 실패", detail: queryErr.message }, { status: 500 });
  }

  const staleOrMissingPosts = (posts ?? []).filter((post) => !isCurrentReelVideoUrl(post.instagram_reel_video_url));

  if (staleOrMissingPosts.length === 0) {
    const { count: blockedByQuality } = await admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null)
      .is("instagram_reel_published_at", null)
      .lt("instagram_reel_render_attempt_count", 3)
      .or("admin_review_required.is.null,admin_review_required.eq.true");
    if ((blockedByQuality ?? 0) > 0) {
      if (dryRun) return dryResponse("quality_review_pending", { blockedByQuality });
      await safeLogSkip("quality_review_pending", { blockedByQuality });
      return NextResponse.json({ status: "quality_review_pending", blockedByQuality });
    }
    if (dryRun) return dryResponse("no_pending");
    await safeLogSkip("no_pending");
    return NextResponse.json({ status: "no_pending", message: "Reels 영상 생성 대기 글 없음" });
  }

  const assessed = staleOrMissingPosts.map((candidate) => ({
    candidate,
    assessment: assessExternalPublishQuality(candidate),
    reelQuality: scoreReelCandidate(candidate),
  }));
  const approved = assessed
    .filter((item) => item.assessment.approved && item.reelQuality.approved)
    .sort((a, b) => b.reelQuality.score - a.reelQuality.score)[0];
  if (!approved) {
    const first = assessed[0];
    if (dryRun) {
      return dryResponse("quality_gate_rejected", {
        slug: first.candidate.slug,
        blockedByQuality: assessed.length,
        reasons: [...first.assessment.reasons, ...first.reelQuality.reasons],
        metrics: { ...first.assessment.metrics, reel: first.reelQuality.metrics, reelScore: first.reelQuality.score },
      });
    }
    await safeLogSkip("quality_gate_rejected", {
      slug: first.candidate.slug,
      blockedByQuality: assessed.length,
      reasons: [...first.assessment.reasons, ...first.reelQuality.reasons],
    });
    return NextResponse.json({ status: "quality_gate_rejected", slug: first.candidate.slug, blockedByQuality: assessed.length });
  }

  const post = approved.candidate;
  const currentAttempt = post.instagram_reel_render_attempt_count ?? 0;
  if (dryRun) {
    return dryResponse("ready", {
      candidate: { id: post.id, slug: post.slug, attempt_count: currentAttempt },
      expectedDurationSeconds: 15,
    });
  }

  const claim = await admin
    .from("blog_posts")
    .update({ instagram_reel_render_attempt_count: currentAttempt + 1 })
    .eq("id", post.id)
    .eq("instagram_reel_render_attempt_count", currentAttempt)
    .is("instagram_reel_published_at", null)
    .select("id, instagram_reel_render_attempt_count");
  if (claim.error || !claim.data || claim.data.length === 0) {
    await safeLogSkip("attempt_claim_failed", {
      slug: post.slug,
      error: claim.error?.message ?? null,
      rows_affected: claim.data?.length ?? 0,
    });
    return NextResponse.json({ status: "attempt_claim_failed", slug: post.slug });
  }

  let rendered: Awaited<ReturnType<typeof renderReelVideo>> | null = null;
  try {
    rendered = await renderReelVideo(post);
    const bytes = await readFile(rendered.filePath);
    const path = storagePath(post.slug);
    const { error: uploadError } = await admin.storage
      .from("instagram-reels")
      .upload(path, bytes, {
        contentType: "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw new Error(`storage upload 실패: ${uploadError.message}`);
    const { data: urlData } = admin.storage.from("instagram-reels").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    await admin
      .from("blog_posts")
      .update({
        instagram_reel_video_url: publicUrl,
        instagram_reel_error: null,
      })
      .eq("id", post.id);
    await logAdminAction({
      actorId: null,
      action: "instagram_reel_render_success",
      details: {
        post_id: post.id,
        slug: post.slug,
        video_url: publicUrl,
        storage_path: path,
        duration_seconds: rendered.durationSeconds,
      },
    });
    return NextResponse.json({
      status: "ok",
      slug: post.slug,
      videoUrl: publicUrl,
      detailUrl: `${siteUrl()}/blog/${post.slug}`,
      durationSeconds: rendered.durationSeconds,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await admin
      .from("blog_posts")
      .update({ instagram_reel_error: `render: ${error}`.slice(0, 500) })
      .eq("id", post.id);
    await logAdminAction({
      actorId: null,
      action: "instagram_reel_render_fail",
      details: { post_id: post.id, slug: post.slug, error: error.slice(0, 200), attempt: currentAttempt + 1 },
    });
    return NextResponse.json({ status: "error", slug: post.slug, error, attempt: currentAttempt + 1 }, { status: 500 });
  } finally {
    if (rendered) await rendered.cleanup();
  }
}
