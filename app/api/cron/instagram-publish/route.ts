// ============================================================
// 인스타 자동 발행 cron — 5분마다 발행 대기 글 1건 처리
// ============================================================
// 발행 후보:
//   blog_posts.published_at IS NOT NULL          (실제 발행됨)
//   AND blog_posts.instagram_published_at IS NULL (아직 인스타 안 됨)
//   AND blog_posts.instagram_attempt_count < 3   (3회 실패 시 포기)
//
// 1 cron 1건만 처리 (Graph API rate limit 안전 마진 + 실패 시 다른 글로 전파 방지).
//
// vercel.json: { "path": "/api/cron/instagram-publish", "schedule": "*/5 * * * *" }
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishCarousel } from "@/lib/instagram/publish";
import { loadValidToken } from "@/lib/instagram/oauth";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
}

export async function GET(request: Request) {
  // cron secret 검증 (다른 cron 과 동일 패턴)
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ━━━ 인스타 정지 예방 안전책 (2026-05-12 추가) ━━━

  // 1) 시간대 제한 — KST 09~22 만 발행 (밤 시간 spam 의심 회피)
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (kstHour < 9 || kstHour >= 22) {
    return NextResponse.json({
      status: "outside_hours",
      kstHour,
      message: "KST 09~22 만 발행 (인스타 정지 예방)",
    });
  }

  // OAuth flow 미연결 시 graceful skip (instagram_oauth_tokens 빈 테이블 — cron 매 5분 audit 폭주 방지)
  // 만료 임박 token 은 loadValidToken 내부에서 자동 refresh.
  const admin = createAdminClient();
  const creds = await loadValidToken(admin);
  if (!creds) {
    return NextResponse.json({
      status: "not_configured",
      message:
        "instagram_oauth_tokens 비어있거나 모든 token 만료 — /admin/instagram 에서 OAuth 연결 필요",
    });
  }

  const supabase = await createClient();

  // 2) 일 cap — KST 자정 이후 발행 카운트 + ramp-up
  //    KST 자정 = UTC 15:00 (전날 15:00 UTC ~ 오늘 15:00 UTC = KST 00:00 ~ 24:00)
  const nowUtc = new Date();
  const kstMidnight = new Date(nowUtc);
  kstMidnight.setUTCHours(15, 0, 0, 0);
  if (nowUtc.getUTCHours() < 15) {
    kstMidnight.setUTCDate(kstMidnight.getUTCDate() - 1);
  }

  // 첫 인스타 발행 — ramp-up 판정 기준
  const { data: firstPub } = await admin
    .from("blog_posts")
    .select("instagram_published_at")
    .not("instagram_published_at", "is", null)
    .order("instagram_published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const isNewAccount =
    !firstPub?.instagram_published_at ||
    Date.now() - new Date(firstPub.instagram_published_at).getTime() <
      7 * 86_400_000;
  const dailyCap = isNewAccount ? 5 : 14; // 첫 7일 5건/일, 이후 14건/일

  const { count: todayCount } = await admin
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .gte("instagram_published_at", kstMidnight.toISOString());

  if ((todayCount ?? 0) >= dailyCap) {
    return NextResponse.json({
      status: "daily_cap_reached",
      todayCount,
      dailyCap,
      isNewAccount,
      message: `오늘 발행 cap (${dailyCap}건) 도달 — 인스타 정지 예방`,
    });
  }

  // 3) Jitter — random 0~90초 sleep (cron 정각 동시 호출 spike 회피, 봇 패턴 회피)
  const jitterMs = Math.floor(Math.random() * 90_000);
  await new Promise((r) => setTimeout(r, jitterMs));

  // 발행 대기 글 1건 (가장 오래된 것 먼저 — FIFO)
  const { data: post, error: queryErr } = await supabase
    .from("blog_posts")
    .select("id, slug, title, meta_description, category, tags, instagram_attempt_count")
    .not("published_at", "is", null)
    .is("instagram_published_at", null)
    .lt("instagram_attempt_count", 3)
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queryErr) {
    return NextResponse.json(
      { error: "DB query 실패", detail: queryErr.message },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json({ status: "no_pending", message: "발행 대기 글 없음" });
  }

  // 카드 3장 public URL (api/instagram-card 가 만드는 1080×1080)
  const base = siteUrl();
  const cardUrls: [string, string, string] = [
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/1`,
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/2`,
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/3`,
  ];

  // attempt_count 먼저 증가 (실패해도 무한 retry 방지)
  await supabase
    .from("blog_posts")
    .update({ instagram_attempt_count: (post.instagram_attempt_count ?? 0) + 1 })
    .eq("id", post.id);

  // 발행 시도 (OAuth flow 로 발급받은 long-lived token 사용)
  const result = await publishCarousel(
    {
      title: post.title,
      meta_description: post.meta_description,
      category: post.category,
      tags: post.tags,
      detailUrl: `${base}/blog/${post.slug}`,
      cardUrls,
    },
    { token: creds.token, userId: creds.userId },
  );

  if (result.ok) {
    await supabase
      .from("blog_posts")
      .update({
        instagram_published_at: new Date().toISOString(),
        instagram_media_id: result.mediaId,
        instagram_error: null,
      })
      .eq("id", post.id);

    await logAdminAction({
      actorId: null,
      action: "instagram_publish_success",
      details: {
        post_id: post.id,
        slug: post.slug,
        media_id: result.mediaId,
        permalink: result.permalink,
      },
    });

    return NextResponse.json({
      status: "ok",
      mediaId: result.mediaId,
      permalink: result.permalink,
      slug: post.slug,
    });
  }

  // 실패 — error 저장. 3회 실패 시 health-alert 가 자동 감지
  await supabase
    .from("blog_posts")
    .update({ instagram_error: result.error.slice(0, 500) })
    .eq("id", post.id);

  await logAdminAction({
    actorId: null,
    action: "instagram_publish_fail",
    details: {
      post_id: post.id,
      slug: post.slug,
      error: result.error.slice(0, 200),
      attempt: (post.instagram_attempt_count ?? 0) + 1,
    },
  });

  return NextResponse.json(
    {
      status: "error",
      slug: post.slug,
      error: result.error,
      attempt: (post.instagram_attempt_count ?? 0) + 1,
    },
    { status: 500 },
  );
}
