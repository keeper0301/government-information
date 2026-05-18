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

export function buildSummaryMessage(input: {
  publishedCount: number;
  successAttempts: number;
  failedAttempts: number;
  lastPublishedAt: string | null;
}): { subject: string; message: string } {
  const { publishedCount, successAttempts, failedAttempts, lastPublishedAt } = input;

  if (publishedCount === 0) {
    return {
      subject: "[keepioo] 블로그 24h 발행 0건 ⚠️",
      message: [
        `24h 블로그 발행 0건 감지.`,
        `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
        ``,
        `[의심 원인]`,
        `1. Gemini quota (RESOURCE_EXHAUSTED) — https://aistudio.google.com/spend`,
        `2. sparse 가드 차단 ("본문이 너무 짧음") — admin_actions.blog_publish_run details 확인`,
        `3. GitHub Actions cron 노쇼 — https://github.com/keeper0301/government-information/actions`,
      ].join("\n"),
    };
  }

  return {
    subject: `[keepioo] 블로그 ${publishedCount}건 발행`,
    message: [
      `24h 블로그 ${publishedCount}건 정상 발행.`,
      `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
      lastPublishedAt ? `마지막 발행: ${new Date(lastPublishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : null,
    ].filter(Boolean).join("\n"),
  };
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

  const summary = buildSummaryMessage({
    publishedCount: publishedCount ?? 0,
    successAttempts,
    failedAttempts,
    lastPublishedAt: latest?.published_at ?? null,
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
