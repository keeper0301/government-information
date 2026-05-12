// ============================================================
// 네이버 블로그 자동 발행 cron — RPA Playwright
// ============================================================
// ⚠️ DEPRECATED (2026-05-13) — vercel.json schedule 제거됨.
// Vercel chromium IP 차단으로 publisher.ts 가 작동 안 함. 실제 사용은
// scripts/naver-publish-runner.mjs (사장님 PC) 만. 이 route 는 향후 OpenAPI
// 또는 다른 환경 전환 시 참고용 + ?dry_run=1 manual test 용도로만 유지.
// ============================================================
// 흐름:
//   1) kill switch + 시간대 (KST 09~22) + cookies 존재
//   2) 일 cap 검사 (audit 기반) — 신규 7일 3건, 그 이후 7건
//   3) jitter 0~120s
//   4) naver_blog_queue pending 1건 pull (attempt < 3)
//   5) attempt_count 증가 (.select() 로 검증 — 인스타 사고 패턴 회피)
//   6) Playwright publish (캡차·2FA 감지 시 abort + 텔레그램 알림)
//   7) 결과에 따라 markPublished or last_error 갱신 + audit row
//
// 모든 시도 = audit row 1개. 일일 cap·진단의 single source of truth.
// vercel.json: { "path": "/api/cron/naver-publish", "schedule": "30 1,4,7,10 * * *" }
//   매 3시간 1회 정도 (인스타와 분산). 환경변수로 비활성 시작 → 검증 후 켜기.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveCookies } from "@/lib/naver-blog/cookies-vault";
import { convertToNaverBlogHtml } from "@/lib/naver-blog/format";
import { publishToNaverBlog } from "@/lib/naver-blog/publisher";
import {
  logPublishAudit,
  countTodaySuccess,
  getKstHour,
  type AuditSkipReason,
} from "@/lib/naver-blog/audit";

export const dynamic = "force-dynamic";
// Vercel Pro: chromium cold start 6s + SE3 입력 30s + jitter 120s + 발행 모달 5s = ~3min
export const maxDuration = 300;

type CronResult = Record<string, unknown>;

export async function GET(request: Request) {
  // cron secret 검증
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?dry_run=1 & ?force=1 — 운영자 manual 검증용 (CRON_SECRET Bearer 필요).
  // dry_run: publisher 의 마지막 발행 click 만 skip (selector·iframe·cookies 검증).
  // force:   NAVER_CRON_DISABLED·시간대·일 cap 무시 (검증용). 단 캡차/2FA 감지 + cookies 만료 검사는 유지.
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const force = url.searchParams.get("force") === "1";

  // 0) Kill switch — 검증 끝나기 전까지 NAVER_CRON_DISABLED=true 로 시작
  if (!force && process.env.NAVER_CRON_DISABLED === "true") {
    await skip("disabled", {});
    return NextResponse.json({ status: "disabled", message: "NAVER_CRON_DISABLED=true" });
  }

  // 1) 시간대 — KST 09~22 만 (밤·새벽 발행 = 봇 의심)
  const kstHour = getKstHour();
  if (!force && (kstHour < 9 || kstHour >= 22)) {
    await skip("outside_hours", { kstHour });
    return NextResponse.json({ status: "outside_hours", kstHour });
  }

  // 2) cookies vault — 없으면 즉시 skip
  const cookies = await getActiveCookies();
  if (!cookies) {
    await skip("no_cookies", {});
    return NextResponse.json({
      status: "no_cookies",
      message: "/admin/naver-blog/cookies 에서 cookies 업로드 필요",
    });
  }

  // cookies 만료 임박 (이미 만료) — 알림 + skip
  if (cookies.expiresMin) {
    const expMs = new Date(cookies.expiresMin).getTime();
    if (expMs < Date.now()) {
      await skip("cookies_expired", { expiresMin: cookies.expiresMin });
      await alertTelegram(
        "⚠️ 네이버 cookies 만료. /admin/naver-blog/cookies 에서 재로그인 후 업로드 필요.",
      );
      return NextResponse.json({ status: "cookies_expired" });
    }
  }

  // 3) 일 cap — naver_publish_audit 의 오늘 success 카운트 기반
  const todayCount = await countTodaySuccess();
  const isNewAccount = await isNewAccountWindow();
  const dailyCap = isNewAccount ? 3 : 7;
  if (!force && todayCount >= dailyCap) {
    await skip("daily_cap_reached", { todayCount, dailyCap, isNewAccount });
    return NextResponse.json({
      status: "daily_cap_reached",
      todayCount,
      dailyCap,
      isNewAccount,
    });
  }

  // 4) Jitter — 0~120s (cron 정각 동시 호출 spike 회피, 봇 패턴 회피).
  // dry-run/force 검증 시에는 즉시 응답이 필요해서 jitter skip.
  const jitterMs = force || dryRun ? 0 : Math.floor(Math.random() * 120_000);
  if (jitterMs > 0) {
    await new Promise((r) => setTimeout(r, jitterMs));
  }

  // 5) pending 큐에서 1건 pull (FIFO)
  const admin = createAdminClient();
  const { data: row, error: queryErr } = await admin
    .from("naver_blog_queue")
    .select(
      "id, blog_post_id, attempt_count, blog_post:blog_posts!inner(slug, title, content, meta_description, category)",
    )
    .eq("status", "pending")
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queryErr) {
    await logPublishAudit({
      postId: null,
      result: "fail",
      errorMessage: queryErr.message,
      details: { stage: "queue_query" },
    });
    return NextResponse.json({ error: "DB query 실패", detail: queryErr.message }, { status: 500 });
  }

  if (!row) {
    await skip("no_pending_queue", {});
    return NextResponse.json({ status: "no_pending_queue" });
  }

  // 6) attempt_count 증가 — .select() 로 영향 row 검증 (인스타 사고 패턴).
  // dry-run 시 attempt_count 안 올림 (검증인데 큐 cap 줄이지 않음).
  if (!dryRun) {
    const expected = (row.attempt_count ?? 0) + 1;
    const updateRes = await admin
      .from("naver_blog_queue")
      .update({ attempt_count: expected })
      .eq("id", row.id)
      .select("id, attempt_count");
    if (updateRes.error || !updateRes.data || updateRes.data.length === 0) {
      await logPublishAudit({
        postId: row.blog_post_id,
        result: "fail",
        errorMessage: `attempt_count update 실패: ${updateRes.error?.message ?? "rows=0"}`,
        details: { queue_id: row.id, expected, rows_affected: updateRes.data?.length ?? 0 },
      });
      return NextResponse.json({ error: "attempt update 실패" }, { status: 500 });
    }
  }

  // 7) Playwright 발행
  const blogPostRaw = row.blog_post as unknown;
  const post = Array.isArray(blogPostRaw) ? blogPostRaw[0] : blogPostRaw;
  const payload = convertToNaverBlogHtml(post);
  const result = await publishToNaverBlog({
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    cookies: cookies.cookies,
    dryRun,
  });

  if (result.ok) {
    // dry-run 일 때는 큐 status·publish 변경 X (검증인데 큐 빼지 않음).
    if (!dryRun) {
      await admin
        .from("naver_blog_queue")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          naver_url: result.naverUrl,
          last_error: null,
        })
        .eq("id", row.id);
    }

    await logPublishAudit({
      postId: row.blog_post_id,
      result: dryRun ? "skipped" : "success",
      naverUrl: result.naverUrl,
      skipReason: dryRun ? null : null,
      details: { ...result.details, queue_id: row.id, jitterMs, kstHour, dry_run: dryRun, force },
    });

    return NextResponse.json({
      status: dryRun ? "dry_run_ok" : "published",
      queueId: row.id,
      naverUrl: result.naverUrl,
      details: result.details,
    });
  }

  // 8) 실패 — last_error 갱신 + audit
  await admin
    .from("naver_blog_queue")
    .update({ last_error: result.error })
    .eq("id", row.id);

  // 캡차·2FA 는 사장님 manual 개입 필요 — 텔레그램 알림
  if (result.reason === "captcha_detected" || result.reason === "2fa_detected") {
    await alertTelegram(
      `⚠️ 네이버 ${result.reason === "captcha_detected" ? "캡차" : "2단계 인증"} 감지. /admin/naver-blog/cookies 에서 재로그인 + cookies 재업로드 필요. 큐 ID=${row.id.slice(0, 8)}.`,
    );
  } else if (result.reason === "session_invalid") {
    await alertTelegram(
      `⚠️ 네이버 cookies 만료 의심 (세션 invalid). /admin/naver-blog/cookies 재업로드 필요.`,
    );
  }

  await logPublishAudit({
    postId: row.blog_post_id,
    result: "fail",
    errorMessage: result.error,
    details: { ...result.details, queue_id: row.id, reason: result.reason, jitterMs },
  });

  return NextResponse.json({
    status: "fail",
    queueId: row.id,
    reason: result.reason,
    error: result.error,
  });
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────
async function skip(reason: AuditSkipReason, details: CronResult): Promise<void> {
  await logPublishAudit({
    postId: null,
    result: "skipped",
    skipReason: reason,
    details: { ...details, kstHour: getKstHour() },
  });
}

/**
 * 첫 성공 발행 시점 ~ 7일 이내면 신규 계정 (보수적 cap).
 * audit 첫 success row 의 attempted_at 기준.
 */
async function isNewAccountWindow(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("naver_publish_audit")
    .select("attempted_at")
    .eq("result", "success")
    .order("attempted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.attempted_at) return true;
  const first = new Date(data.attempted_at).getTime();
  return Date.now() - first < 7 * 86_400_000;
}

async function alertTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}
