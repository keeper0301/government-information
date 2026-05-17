// ============================================================
// /api/cron/daily-digest — 매일 KST 08:00 사장님 KPI SMS
// ============================================================
// 어제 핵심 지표 (가입·활성·신규 정책·자동 처리) 를 SMS 한 통에 요약.
// 사장님이 어드민 들여다보지 않아도 "어제 운영 어떻게 굴러갔는지" 즉시 인지.
//
// vercel.json: '0 23 * * *' UTC = KST 08:00.
// ============================================================

import { NextResponse } from "next/server";
import {
  collectDailyDigest,
  formatDigestMessage,
  reviewQueueTotal,
} from "@/lib/notifications/daily-digest";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run(): Promise<NextResponse> {
  const data = await collectDailyDigest();
  const message = formatDigestMessage(data);
  const reviewTotal = reviewQueueTotal(data);

  // 검토 필요 ≥ 1 → 어드민 link 노출. 0 이면 link 생략 (SMS 깔끔, 사장님 어드민 진입 X).
  // cron 실패 1+ 도 진입 동기 → cron-failures 페이지 link.
  const link =
    data.cronFailures24h > 0
      ? "keepioo.com/admin/cron-failures"
      : reviewTotal > 0
        ? "keepioo.com/admin"
        : "";

  // G8 (2026-05-17) — SMS + 텔레그램 multi-channel 발송 (Solapi balance 0 사고 영구 대비).
  // 5/14~17 Solapi balance 0 으로 daily-digest SMS 4일 손실 + 사장님 KPI·AdSense reminder 도달 0.
  // health-alert · external-console-check 와 일관된 multichannel 패턴.
  const multi = await sendOpsAlertMultichannel({
    subject: "",
    message,
    link,
  });
  const sms = multi.sms;
  const telegram = multi.telegram;

  // 2026-05-14 — cron 가동 흔적 audit (가시성 강화)
  // G8 — telegram_ok / telegram_reason 추가로 사장님 도달 채널 진단 가능
  await auditCronRun("daily_digest_run", {
    review_queue_total: reviewTotal,
    cron_failures_24h: data.cronFailures24h,
    sms_ok: sms?.ok ?? null,
    sms_reason: sms?.ok === false ? sms.reason : undefined,
    telegram_ok: telegram?.ok ?? null,
    telegram_reason: telegram?.ok === false ? telegram.reason : undefined,
    any_delivered: multi.anyDelivered,
    has_link: link.length > 0,
  });

  return NextResponse.json({
    ok: true,
    data,
    message,
    reviewTotal,
    link,
    sms,
    telegram,
    anyDelivered: multi.anyDelivered,
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
