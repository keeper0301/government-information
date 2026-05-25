// ============================================================
// A3 — Sentry 일일 에러 요약 cron (텔레그램 발송).
// ============================================================
// 매일 KST 09:45 (UTC 00:45) — daily-digest·support-reminder·cancellation 직후.
// SENTRY_AUTH_TOKEN/ORG/PROJECT env 미설정 시 graceful skip (텔레그램 X).

import { NextResponse } from "next/server";
import { fetchSentryDailySummary } from "@/lib/sentry/daily-summary";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { authorizeCronRequest, getCronAuthorizationHeader } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run() {
  const summary = await fetchSentryDailySummary();
  if (!summary.ok) {
    // 2026-05-14 — skipped 분기에도 audit (cron 가동 흔적 보장)
    await auditCronRun("sentry_daily_summary_run", {
      skipped: summary.reason,
    });
    return NextResponse.json({
      ok: false,
      reason: summary.reason,
      message: "Sentry env 미설정 또는 fetch 실패 — 텔레그램 발송 skip",
    });
  }

  // 같은 prod 의 notify-telegram 호출 (CRON_SECRET 인증).
  // 동일 deployment 내 호출이라 cold start 영향 작음.
  const authorizationHeader = getCronAuthorizationHeader();
  if (!authorizationHeader) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const tgRes = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com"}/api/notify-telegram`,
    {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: summary.textForSummary }),
    },
  );
  const tgData = (await tgRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  // 2026-05-14 — cron 가동 흔적 audit (가시성 강화)
  await auditCronRun("sentry_daily_summary_run", {
    total_issues: summary.total,
    new_issues: summary.issues.length,
    telegram_ok: tgRes.ok,
  });

  return NextResponse.json({
    ok: tgRes.ok,
    sentry: { total: summary.total, issues: summary.issues.length },
    telegram: tgData,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
