// ============================================================
// 인스타 자동 발행 cron — 15분마다 1회 발행 대기 글 1건 처리
// ============================================================
// 발행 후보:
//   blog_posts.published_at IS NOT NULL          (실제 발행됨)
//   AND blog_posts.instagram_published_at IS NULL (아직 인스타 안 됨)
//   AND blog_posts.instagram_attempt_count < 3   (3회 실패 시 포기)
//
// 1 cron 1건만 처리 (Graph API rate limit 안전 마진 + 실패 시 다른 글로 전파 방지).
//
// vercel.json: { "path": "/api/cron/instagram-publish", "schedule": "*/15 * * * *" }
// 15분마다 1회 fire. 새 글 평균 발행 대기 ~7.5분.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishCarousel } from "@/lib/instagram/publish";
import { loadValidToken } from "@/lib/instagram/oauth";
import { logAdminAction } from "@/lib/admin-actions";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// 2026-05-12: jitter (max 90s) + container polling (max 60s) + 5 Graph API
// 호출 + retry → 최대 ~180s. Vercel Pro 한도 300s.
// 2026-05-16: polling 60s → 120s + FINISHED 후 5s sleep — 첫 시도 fail 2건 fix.
//             최대 ~245s 까지 늘어남. Vercel 300s 한도 안전 마진 55s.
export const maxDuration = 300;

const DEFAULT_NEW_ACCOUNT_DAILY_CAP = 12;
const DEFAULT_ESTABLISHED_DAILY_CAP = 28;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDailyCap(isNewAccount: boolean): number {
  const fallback = isNewAccount ? DEFAULT_NEW_ACCOUNT_DAILY_CAP : DEFAULT_ESTABLISHED_DAILY_CAP;
  const envKey = isNewAccount
    ? "INSTAGRAM_NEW_ACCOUNT_DAILY_CAP"
    : "INSTAGRAM_ESTABLISHED_DAILY_CAP";
  return parsePositiveInt(process.env[envKey] ?? process.env.INSTAGRAM_DAILY_CAP, fallback);
}

type InstagramPublishStatus =
  | "disabled"
  | "outside_hours"
  | "not_configured"
  | "daily_cap_reached"
  | "quality_review_pending"
  | "no_pending"
  | "quality_gate_rejected"
  | "ready";

function isDryRunRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.searchParams.get("dry") === "1" ||
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("status") === "1"
  );
}

function isForcePublishNowRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("force") === "1" || url.searchParams.get("publishNow") === "1";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
}

export async function GET(request: Request) {
  // cron secret 필수 검증 — 실제 인스타 발행 + Graph API 토큰 소모 cron 이라
  // CRON_SECRET 미설정 시 무인증 노출을 막기 위해 authorizeCronRequest(필수) 사용
  // (다른 발행성 cron 45개와 일관, 코드리뷰 P2).
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const dryRun = isDryRunRequest(request);
  const forcePublishNow = !dryRun && isForcePublishNowRequest(request);

  // ━━━ 인스타 정지 예방 안전책 (2026-05-12 추가) ━━━

  // skip 사유 audit — outside_hours / daily_cap_reached / not_configured / disabled.
  // 사장님 매일 점검 시 "오늘 cron 가동했는데 왜 발행 안 됐지?" 진단 흔적.
  async function logSkip(reason: string, extra: Record<string, unknown>) {
    try {
      await logAdminAction({
        actorId: null,
        action: "instagram_publish_skipped",
        details: { reason, ...extra },
      });
    } catch {
      // audit 실패는 cron 본체 응답 유지 (운영 안전)
    }
  }

  function dryResponse(
    status: InstagramPublishStatus,
    extra: Record<string, unknown> = {},
  ) {
    return NextResponse.json({ dryRun: true, status, ...extra });
  }

  // 0) Kill switch — INSTAGRAM_CRON_DISABLED=true 면 즉시 skip
  //    rate limit·정지 위험 비상 정지 용. vercel.json schedule 안 건드리고
  //    env 만으로 켜고/끄기 (사장님 비개발자 운영 편의)
  if (process.env.INSTAGRAM_CRON_DISABLED === "true") {
    if (dryRun) return dryResponse("disabled");
    await logSkip("disabled", {});
    return NextResponse.json({
      status: "disabled",
      message:
        "INSTAGRAM_CRON_DISABLED=true — cron 일시 정지 중. 재가동: Vercel env 제거 + Redeploy",
    });
  }

  // 1) 시간대 제한 — KST 09~22 만 발행 (밤 시간 spam 의심 회피)
  //    INSTAGRAM_BYPASS_HOUR_CHECK=true 또는 인증된 force=1 요청이면 일시 우회
  //    (사장님 명시 승인 시범 발행용). dry-run 에서는 force 무시.
  const bypassHourCheck = process.env.INSTAGRAM_BYPASS_HOUR_CHECK === "true";
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (!bypassHourCheck && !forcePublishNow && (kstHour < 9 || kstHour >= 22)) {
    if (dryRun) return dryResponse("outside_hours", { kstHour });
    await logSkip("outside_hours", { kstHour });
    return NextResponse.json({
      status: "outside_hours",
      kstHour,
      message: "KST 09~22 만 발행 (인스타 정지 예방)",
    });
  }
  if (forcePublishNow && (kstHour < 9 || kstHour >= 22)) {
    await logSkip("force_publish_now_bypass_hour_check", { kstHour });
  }

  // OAuth flow 미연결 시 graceful skip (instagram_oauth_tokens 빈 테이블 — cron 매 5분 audit 폭주 방지)
  // 만료 임박 token 은 loadValidToken 내부에서 자동 refresh.
  const admin = createAdminClient();
  const creds = await loadValidToken(admin);
  if (!creds) {
    if (dryRun) return dryResponse("not_configured");
    await logSkip("not_configured", {});
    return NextResponse.json({
      status: "not_configured",
      message:
        "instagram_oauth_tokens 비어있거나 모든 token 만료 — /admin/instagram 에서 OAuth 연결 필요",
    });
  }

  // 모든 UPDATE 는 admin client 사용 (RLS 우회 — anon 으로 UPDATE 하면 row 0개
  // 영향이라 attempt_count 가 0 으로 영구 고정 → 3회 가드 무효화 + 무한 retry).
  // 2026-05-12 사고: 같은 글에 4번 시도하고도 카운트 안 올라간 사례 확인.

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
  const dailyCap = resolveDailyCap(isNewAccount); // 기본: 첫 7일 12건/일, 이후 28건/일. env로 하향/상향 가능.

  const { count: todayCount } = await admin
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .gte("instagram_published_at", kstMidnight.toISOString());

  if ((todayCount ?? 0) >= dailyCap) {
    if (dryRun) {
      return dryResponse("daily_cap_reached", {
        todayCount,
        dailyCap,
        isNewAccount,
        kstMidnight: kstMidnight.toISOString(),
      });
    }
    await logSkip("daily_cap_reached", { todayCount, dailyCap, isNewAccount });
    return NextResponse.json({
      status: "daily_cap_reached",
      todayCount,
      dailyCap,
      isNewAccount,
      message: `오늘 발행 cap (${dailyCap}건) 도달 — 인스타 정지 예방`,
    });
  }

  // 3) Jitter — random 0~90초 sleep (cron 정각 동시 호출 spike 회피, 봇 패턴 회피)
  // 인증된 publish-now 호출은 사용자 명시 즉시 발행이라 jitter 없이 실행한다.
  const jitterMs = dryRun || forcePublishNow ? 0 : Math.floor(Math.random() * 90_000);
  if (jitterMs > 0) {
    await new Promise((r) => setTimeout(r, jitterMs));
  }

  // 발행 대기 글 후보 최대 10건을 FIFO 로 가져온다.
  // 첫 글이 template_smell_detected 로 막혀도 뒤의 정상 후보까지 같이 본다.
  // 기존 1건 only 선택은 나쁜 후보 1개가 전체 Instagram 일반글 발행을 영구 정지시키는 병목이었다.
  const pendingPostRes = await admin
    .from("blog_posts")
    .select("id, slug, title, content, meta_description, category, tags, instagram_attempt_count, admin_review_required")
    .not("published_at", "is", null)
    .is("instagram_published_at", null)
    .eq("admin_review_required", false)
    .lt("instagram_attempt_count", 3)
    .order("published_at", { ascending: true })
    .limit(10);
  const pendingPosts = pendingPostRes.data ?? [];
  const queryErr = pendingPostRes.error;

  if (queryErr) {
    // 2026-05-14 — DB query 실패 분기 audit (cron 가시성 강화)
    await logSkip("query_failed", { error: queryErr.message.slice(0, 200) });
    return NextResponse.json(
      { error: "DB query 실패", detail: queryErr.message },
      { status: 500 },
    );
  }

  if (pendingPosts.length === 0) {
    const { count: blockedByQuality } = await admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null)
      .is("instagram_published_at", null)
      .lt("instagram_attempt_count", 3)
      .or("admin_review_required.is.null,admin_review_required.eq.true");
    if ((blockedByQuality ?? 0) > 0) {
      if (dryRun) {
        return dryResponse("quality_review_pending", { blockedByQuality });
      }
      await logSkip("quality_review_pending", { blockedByQuality });
      return NextResponse.json({
        status: "quality_review_pending",
        blockedByQuality,
        message: "품질 검수 통과 전 글은 인스타 자동 발행하지 않음",
      });
    }
    if (dryRun) {
      const { count: exhaustedAttempts } = await admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .eq("admin_review_required", false)
        .gte("instagram_attempt_count", 3);
      return dryResponse("no_pending", { exhaustedAttempts: exhaustedAttempts ?? 0 });
    }
    // 2026-05-14 — no_pending 분기 audit (정상 가동 흔적 보장)
    await logSkip("no_pending", {});
    return NextResponse.json({ status: "no_pending", message: "발행 대기 글 없음" });
  }

  const rejectedCandidates: Array<{
    slug: string;
    reasons: string[];
  }> = [];
  let post = pendingPosts[0];
  let qualityAssessment: ReturnType<typeof assessExternalPublishQuality> | null = null;

  for (const candidate of pendingPosts) {
    const assessment = assessExternalPublishQuality(candidate);
    if (assessment.approved) {
      post = candidate;
      qualityAssessment = assessment;
      break;
    }
    if (!qualityAssessment) qualityAssessment = assessment;
    rejectedCandidates.push({ slug: candidate.slug, reasons: assessment.reasons });
  }

  if (!qualityAssessment) qualityAssessment = assessExternalPublishQuality(post);

  if (!qualityAssessment.approved) {
    if (dryRun) {
      return dryResponse("quality_gate_rejected", {
        slug: post.slug,
        reasons: qualityAssessment.reasons,
        metrics: qualityAssessment.metrics,
        scannedCandidates: pendingPosts.length,
        rejectedCandidates,
      });
    }
    await logSkip("quality_gate_rejected", {
      slug: post.slug,
      scannedCandidates: pendingPosts.length,
      rejectedCandidates: rejectedCandidates.slice(0, 5),
    });
    return NextResponse.json({
      status: "quality_gate_rejected",
      slug: post.slug,
      scannedCandidates: pendingPosts.length,
    });
  }

  if (!dryRun && rejectedCandidates.length > 0) {
    await logSkip("quality_gate_rejected_candidates_skipped", {
      selectedSlug: post.slug,
      skippedCount: rejectedCandidates.length,
      rejectedCandidates: rejectedCandidates.slice(0, 5),
    });
  }

  // 카드 3장 public URL (api/instagram-card 가 만드는 1080×1350, 4:5 portrait)
  const base = siteUrl();
  const cardUrls: [string, string, string] = [
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/1`,
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/2`,
    `${base}/api/instagram-card/${encodeURIComponent(post.slug)}/3`,
  ];

  if (dryRun) {
    return dryResponse("ready", {
      kstHour,
      todayCount: todayCount ?? 0,
      dailyCap,
      isNewAccount,
      candidate: {
        id: post.id,
        slug: post.slug,
        attempt_count: post.instagram_attempt_count ?? 0,
        admin_review_required: post.admin_review_required,
      },
      cardUrls,
    });
  }

  // attempt_count 먼저 증가 (실패해도 무한 retry 방지)
  // .select() 로 실제 update 된 row 가져와서 검증 — row 0개 영향이면 audit.
  // 2026-05-12 사고: 8회 fail 후에도 attempt_count=0 — 진짜 원인 추적용.
  // attempt_count CAS 선점 — .eq(현재값) 조건부 update 로 두 실행(수동 트리거 + 정시
  // cron 등)이 같은 글을 동시에 게시하는 것을 막는다(멱등성). NOT NULL default 0 컬럼이라
  // .eq 매칭 안전. 0행이면 다른 실행이 이미 선점했거나 update 실패 → 중복 게시 방지로
  // 즉시 중단 (코드리뷰 P2 — 기존엔 0행이어도 게시 계속해 중복 위험).
  const currentAttempt = post.instagram_attempt_count ?? 0;
  const updateRes = await admin
    .from("blog_posts")
    .update({ instagram_attempt_count: currentAttempt + 1 })
    .eq("id", post.id)
    .eq("instagram_attempt_count", currentAttempt)
    .select("id, instagram_attempt_count");
  if (updateRes.error || !updateRes.data || updateRes.data.length === 0) {
    await logAdminAction({
      actorId: null,
      action: "instagram_attempt_count_update_failed",
      details: {
        post_id: post.id,
        slug: post.slug,
        expected: currentAttempt + 1,
        error: updateRes.error?.message ?? null,
        rows_affected: updateRes.data?.length ?? 0,
      },
    });
    await logSkip("attempt_claim_failed", { slug: post.slug });
    return NextResponse.json({ status: "attempt_claim_failed", slug: post.slug });
  }

  // 카드 endpoint cold start warmup (2026-05-14 review 정리)
  // Instagram 이 image_url fetch 시 cold start 응답 못 받으면 "Media ID is not available"
  // / container ERROR 사고 가능 (5/11~5/12 첫 발행 fail 추정 원인).
  // 첫 카드 GET 1회로 Pretendard font + Supabase query 캐시 활성화 → 세 카드 모두 warm.
  try {
    await fetch(cardUrls[0], { method: "GET", cache: "no-store" });
  } catch {
    // warmup 실패는 무시 (best-effort — 발행 본체는 계속 진행)
  }

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
    await admin
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
  await admin
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
