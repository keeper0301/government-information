// app/api/cron/health-alert/route.ts
// Phase 6 — 매일 09:00 KST 임계치 점검 cron.
// 위반 항목 ≥ 1 면 사장님 이메일 발송 (사고 조기 감지).
// vercel.json crons 에 등록: { "path": "/api/cron/health-alert", "schedule": "0 0 * * *" }

import { NextResponse } from "next/server";
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { sendHealthAlertEmail } from "@/lib/email";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

async function run() {
  const signals = await getHealthSignals();
  const alerts = checkThresholds(signals);

  if (alerts.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      signals,
      message: "임계치 정상",
    });
  }

  const result = await sendHealthAlertEmail(alerts, {
    signups24h: signals.signups24h,
    active7d: signals.active7d,
    active7dAny: signals.active7dAny,
    cronFailures24h: signals.cronFailures24h,
  });

  // 즉시 알림 — SMS 발송 (사장님 휴대폰 푸시처럼 즉시 인지).
  // 환경변수 미설정 시 skipped (운영 단계 보호). 실패해도 email 발송은 유지.
  let smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> | null = null;
  try {
    smsResult = await sendOpsAlertSms({
      subject: `[keepioo 운영] ${alerts.length}건 임계치 초과`,
      message: alerts.map((a) => `- ${a.message}`).join("\n"),
    });
  } catch (e) {
    smsResult = {
      ok: false,
      reason: "network_error",
      error: (e as Error).message,
    };
  }

  return NextResponse.json({
    ok: result.ok,
    sent: result.ok,
    alerts,
    signals,
    sms: smsResult,
    error: result.error,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
