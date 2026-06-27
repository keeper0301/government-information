// ============================================================
// 인스타 Reels 자동 발행 cron — public MP4 URL 이 준비된 blog_posts 1건 처리
// ============================================================
// 릴스는 서버에서 영상을 즉석 생성하지 않는다. blog_posts.instagram_reel_video_url 에
// Meta 서버가 직접 fetch 가능한 public HTTPS MP4 URL 이 있어야 발행한다.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadValidToken } from "@/lib/instagram/oauth";
import { publishReel } from "@/lib/instagram/reels";
import { logAdminAction } from "@/lib/admin-actions";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ReelsStatus =
  | "disabled"
  | "outside_hours"
  | "not_configured"
  | "daily_cap_reached"
  | "quality_review_pending"
  | "no_video_pending"
  | "quality_gate_rejected"
  | "attempt_claim_failed"
  | "ready";

type ReelCandidate = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  admin_review_required: boolean | null;
  instagram_reel_video_url: string;
  instagram_reel_attempt_count: number | null;
};

function isDryRunRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.searchParams.get("dry") === "1" ||
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("status") === "1"
  );
}

function dryResponse(status: ReelsStatus, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ dryRun: true, status, ...extra });
}

function reelsAutoEnabled(): boolean {
  return process.env.INSTAGRAM_REELS_AUTO_ENABLED === "true";
}

function dailyCap(): number {
  const parsed = Number.parseInt(process.env.INSTAGRAM_REELS_DAILY_CAP ?? "2", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

async function safeLogSkip(reason: string, extra: Record<string, unknown> = {}) {
  try {
    await logAdminAction({
      actorId: null,
      action: "instagram_reel_publish_skipped",
      details: { reason, ...extra },
    });
  } catch {
    // audit 실패는 발행 본체 응답을 막지 않는다.
  }
}

function publicVideoUrlOk(videoUrl: string): boolean {
  try {
    return new URL(videoUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const dryRun = isDryRunRequest(request);

  if (!reelsAutoEnabled()) {
    if (dryRun) return dryResponse("disabled", { env: "INSTAGRAM_REELS_AUTO_ENABLED" });
    await safeLogSkip("disabled", { env: "INSTAGRAM_REELS_AUTO_ENABLED" });
    return NextResponse.json({ status: "disabled", message: "INSTAGRAM_REELS_AUTO_ENABLED=true 일 때만 릴스 자동발행" });
  }

  const bypassHourCheck = process.env.INSTAGRAM_REELS_BYPASS_HOUR_CHECK === "true";
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (!bypassHourCheck && (kstHour < 10 || kstHour >= 21)) {
    if (dryRun) return dryResponse("outside_hours", { kstHour });
    await safeLogSkip("outside_hours", { kstHour });
    return NextResponse.json({ status: "outside_hours", kstHour, message: "KST 10~21 만 Reels 발행" });
  }

  const admin = createAdminClient();
  const creds = await loadValidToken(admin);
  if (!creds) {
    if (dryRun) return dryResponse("not_configured");
    await safeLogSkip("not_configured");
    return NextResponse.json({ status: "not_configured", message: "Instagram OAuth token 없음/만료" });
  }

  const nowUtc = new Date();
  const kstMidnight = new Date(nowUtc);
  kstMidnight.setUTCHours(15, 0, 0, 0);
  if (nowUtc.getUTCHours() < 15) kstMidnight.setUTCDate(kstMidnight.getUTCDate() - 1);

  const cap = dailyCap();
  const { count: todayCount } = await admin
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .gte("instagram_reel_published_at", kstMidnight.toISOString());
  if ((todayCount ?? 0) >= cap) {
    if (dryRun) return dryResponse("daily_cap_reached", { todayCount, dailyCap: cap });
    await safeLogSkip("daily_cap_reached", { todayCount, dailyCap: cap });
    return NextResponse.json({ status: "daily_cap_reached", todayCount, dailyCap: cap });
  }

  const { data: post, error: queryErr } = await admin
    .from("blog_posts")
    .select("id, slug, title, content, meta_description, category, tags, admin_review_required, instagram_reel_video_url, instagram_reel_attempt_count")
    .not("published_at", "is", null)
    .not("instagram_reel_video_url", "is", null)
    .is("instagram_reel_published_at", null)
    .eq("admin_review_required", false)
    .lt("instagram_reel_attempt_count", 3)
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle<ReelCandidate>();

  if (queryErr) {
    await safeLogSkip("query_failed", { error: queryErr.message.slice(0, 200) });
    return NextResponse.json({ error: "DB query 실패", detail: queryErr.message }, { status: 500 });
  }

  if (!post) {
    const { count: blockedByQuality } = await admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null)
      .not("instagram_reel_video_url", "is", null)
      .is("instagram_reel_published_at", null)
      .lt("instagram_reel_attempt_count", 3)
      .or("admin_review_required.is.null,admin_review_required.eq.true");
    if ((blockedByQuality ?? 0) > 0) {
      if (dryRun) return dryResponse("quality_review_pending", { blockedByQuality });
      await safeLogSkip("quality_review_pending", { blockedByQuality });
      return NextResponse.json({ status: "quality_review_pending", blockedByQuality });
    }
    if (dryRun) return dryResponse("no_video_pending");
    await safeLogSkip("no_video_pending");
    return NextResponse.json({ status: "no_video_pending", message: "instagram_reel_video_url 이 준비된 발행 대기 글 없음" });
  }

  const assessment = assessExternalPublishQuality(post);
  if (!assessment.approved) {
    if (dryRun) {
      return dryResponse("quality_gate_rejected", {
        slug: post.slug,
        reasons: assessment.reasons,
        metrics: assessment.metrics,
      });
    }
    await safeLogSkip("quality_gate_rejected", { slug: post.slug, reasons: assessment.reasons });
    return NextResponse.json({ status: "quality_gate_rejected", slug: post.slug });
  }

  if (!publicVideoUrlOk(post.instagram_reel_video_url)) {
    if (dryRun) return dryResponse("no_video_pending", { slug: post.slug, reason: "video_url_must_be_https" });
    await safeLogSkip("invalid_video_url", { slug: post.slug });
    return NextResponse.json({ status: "no_video_pending", slug: post.slug, reason: "video_url_must_be_https" });
  }

  const currentAttempt = post.instagram_reel_attempt_count ?? 0;
  if (dryRun) {
    return dryResponse("ready", {
      kstHour,
      todayCount: todayCount ?? 0,
      dailyCap: cap,
      candidate: {
        id: post.id,
        slug: post.slug,
        attempt_count: currentAttempt,
        videoUrl: post.instagram_reel_video_url,
      },
    });
  }

  const updateRes = await admin
    .from("blog_posts")
    .update({ instagram_reel_attempt_count: currentAttempt + 1 })
    .eq("id", post.id)
    .eq("instagram_reel_attempt_count", currentAttempt)
    .select("id, instagram_reel_attempt_count");
  if (updateRes.error || !updateRes.data || updateRes.data.length === 0) {
    await safeLogSkip("attempt_claim_failed", {
      slug: post.slug,
      error: updateRes.error?.message ?? null,
      rows_affected: updateRes.data?.length ?? 0,
    });
    return NextResponse.json({ status: "attempt_claim_failed", slug: post.slug });
  }

  const result = await publishReel(
    {
      title: post.title,
      meta_description: post.meta_description,
      category: post.category,
      tags: post.tags,
      detailUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com"}/blog/${post.slug}`,
      videoUrl: post.instagram_reel_video_url,
      shareToFeed: true,
    },
    { token: creds.token, userId: creds.userId },
  );

  if (result.ok) {
    await admin
      .from("blog_posts")
      .update({
        instagram_reel_published_at: new Date().toISOString(),
        instagram_reel_media_id: result.mediaId,
        instagram_reel_error: null,
      })
      .eq("id", post.id);
    await logAdminAction({
      actorId: null,
      action: "instagram_reel_publish_success",
      details: { post_id: post.id, slug: post.slug, media_id: result.mediaId, permalink: result.permalink },
    });
    return NextResponse.json({ status: "ok", mediaId: result.mediaId, permalink: result.permalink, slug: post.slug });
  }

  await admin
    .from("blog_posts")
    .update({ instagram_reel_error: result.error.slice(0, 500) })
    .eq("id", post.id);
  await logAdminAction({
    actorId: null,
    action: "instagram_reel_publish_fail",
    details: { post_id: post.id, slug: post.slug, error: result.error.slice(0, 200), attempt: currentAttempt + 1 },
  });
  return NextResponse.json({ status: "error", slug: post.slug, error: result.error, attempt: currentAttempt + 1 }, { status: 500 });
}
