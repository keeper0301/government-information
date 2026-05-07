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
} from "@/lib/notifications/daily-digest";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";

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

  // SMS 발송 — 환경변수 (SOLAPI_OPS_FROM_PHONE/TO_PHONE) 미설정 시 skipped
  const sms = await sendOpsAlertSms({
    subject: "",
    message,
  });

  return NextResponse.json({
    ok: true,
    data,
    message,
    sms,
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
