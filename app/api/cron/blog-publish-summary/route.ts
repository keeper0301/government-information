// ============================================================
// /api/cron/blog-publish-summary — 매일 블로그 발행 결과 텔레그램 1건
// ============================================================
// 5/18 OpenAI 사고 (24h 0건) 학습. GitHub Actions publish-blog 가 7건 발행
// 시도해도 사장님 가시성 0이라 사고 진단 늦었음. 매일 KST 07:30 에 24h
// 누적 + 텔레그램 1건 → 사장님이 모바일에서 즉시 확인.
//
// 호출 시점: GitHub Actions publish-blog.yml (UTC 22:07 = KST 07:07) 끝난 후
// 약 23분 여유 (UTC 22:30 = KST 07:30).
//
// 정상 메시지: "블로그 N건 발행 (성공 X, 실패 Y)"
// 사고 메시지: "블로그 24h 0건 — Gemini quota 또는 sparse 가드 의심"
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";
import { buildSummaryMessage } from "@/lib/blog-publish-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  // 24h 발행된 글 수
  const { count: publishedCount } = await admin
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .gte("published_at", since24h);

  // 24h blog_publish_run audit (성공·실패 누적)
  const { data: runs } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "blog_publish_run")
    .gte("created_at", since24h);

  let successAttempts = 0;
  let failedAttempts = 0;
  for (const r of runs ?? []) {
    const d = r.details as { success?: number; failed?: number } | null;
    successAttempts += d?.success ?? 0;
    failedAttempts += d?.failed ?? 0;
  }

  // 마지막 발행 시각
  const { data: latest } = await admin
    .from("blog_posts")
    .select("published_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .single();

  // 2026-05-18 — 24h 발행글 본문 평균 길이 (5/18 OpenAI 사고 학습)
  // HTML tag 제거 후 길이 — < 1700자면 LLM dysfunction 의심
  let avgBodyChars: number | undefined;
  if ((publishedCount ?? 0) > 0) {
    const { data: posts } = await admin
      .from("blog_posts")
      .select("content")
      .gte("published_at", since24h);
    if (posts && posts.length > 0) {
      const totalChars = posts.reduce((sum, p) => {
        const plain = (p.content as string | null)?.replace(/<[^>]+>/g, "").trim() ?? "";
        return sum + plain.length;
      }, 0);
      avgBodyChars = Math.round(totalChars / posts.length);
    }
  }

  // 2026-05-19 — GitHub Actions 지연 모니터링.
  // publish-blog cron 의도: UTC 22:07 = KST 07:07. 실제 첫 발행 시각 측정.
  // 24h 내 첫 발행 (사이클 시작) 시각 - 의도 시각 = 지연 분.
  let cronDelayMinutes: number | undefined;
  const intentedStartUtc = (() => {
    // 오늘 UTC 22:07 또는 어제 UTC 22:07 — 24h 내에서 가장 가까운 cron 의도 시각
    const now = new Date();
    const todayIntent = new Date(now);
    todayIntent.setUTCHours(22, 7, 0, 0);
    if (todayIntent.getTime() > now.getTime()) {
      todayIntent.setUTCDate(todayIntent.getUTCDate() - 1);
    }
    return todayIntent;
  })();
  if ((publishedCount ?? 0) > 0) {
    const { data: firstPost } = await admin
      .from("blog_posts")
      .select("published_at")
      .gte("published_at", intentedStartUtc.toISOString())
      .order("published_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstPost?.published_at) {
      const firstMs = new Date(firstPost.published_at).getTime();
      const delta = firstMs - intentedStartUtc.getTime();
      cronDelayMinutes = Math.max(0, Math.round(delta / 60_000));
    }
  }

  const summary = buildSummaryMessage({
    publishedCount: publishedCount ?? 0,
    successAttempts,
    failedAttempts,
    lastPublishedAt: latest?.published_at ?? null,
    avgBodyChars,
    cronDelayMinutes,
  });

  await sendOpsAlertMultichannel({
    subject: summary.subject,
    message: summary.message,
    link: "https://www.keepioo.com/admin/autonomous",
  });

  await logAdminAction({
    actorId: null,
    action: "blog_publish_summary_run" as AdminActionType,
    details: {
      published_count: publishedCount ?? 0,
      success_attempts: successAttempts,
      failed_attempts: failedAttempts,
      last_published_at: latest?.published_at ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    published_count: publishedCount ?? 0,
    success_attempts: successAttempts,
    failed_attempts: failedAttempts,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
