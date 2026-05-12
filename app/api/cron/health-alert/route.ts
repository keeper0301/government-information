// app/api/cron/health-alert/route.ts
// Phase 6 — 매일 09:00 KST 임계치 점검 cron.
// 위반 항목 ≥ 1 면 사장님 이메일 발송 (사고 조기 감지).
// vercel.json crons 에 등록: { "path": "/api/cron/health-alert", "schedule": "0 0 * * *" }

import { NextResponse } from "next/server";
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { sendHealthAlertEmail } from "@/lib/email";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";
import { logAdminAction } from "@/lib/admin-actions";

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

// admin_actions audit 기록 — 알림 발송 여부와 무관하게 매 cron 실행마다 1건.
// 흔적이 남아야 "오늘 09:00 KST cron 발화했나?" 자체를 점검 가능 (메타 진단).
// 실패해도 cron 본체 응답은 유지 (운영 안전성 우선).
async function logHealthAlertRun(details: {
  alertsCount: number;
  alertKeys: string[];
  signups24h: number;
  active7dAny: number;
  newsBacklogTotal: number;
  pressPending: number;
  pressLastClassifyHours: number;
  enrichPermanentSkip: number;
  // 2026-05-12 추가 — 인스타 token 만료 임박 / 미연결 / 정상 진단성 흔적
  instagramTokenExpiresInDays: number | null;
  // 2026-05-12 추가 — 네이버 RPA cookies 만료 임박 / 미연결 진단성 흔적
  naverCookiesExpiresInDays: number | null;
  smsOk: boolean | null;
  smsReason?: string;
  emailOk: boolean;
}) {
  try {
    await logAdminAction({
      actorId: null, // system actor — cron 자동 실행
      action: "health_alert_run",
      details,
    });
  } catch (e) {
    // audit 실패는 console 만, cron 응답은 유지
    console.warn("[health-alert] admin_actions 기록 실패:", (e as Error).message);
  }
}

async function run() {
  const signals = await getHealthSignals();
  const alerts = checkThresholds(signals);

  if (alerts.length === 0) {
    // 정상 cron 실행도 audit — "오늘 09:00 KST 흔적 없음" = cron 노쇼 신호로 활용 가능
    await logHealthAlertRun({
      alertsCount: 0,
      alertKeys: [],
      signups24h: signals.signups24h,
      active7dAny: signals.active7dAny,
      newsBacklogTotal: signals.newsBacklogTotal,
      pressPending: signals.pressPending,
      pressLastClassifyHours: signals.pressLastClassifyHours,
      enrichPermanentSkip: signals.enrichPermanentSkip,
      instagramTokenExpiresInDays: signals.instagramTokenExpiresInDays,
      naverCookiesExpiresInDays: signals.naverCookiesExpiresInDays,
      smsOk: null,
      emailOk: true,
    });
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
  // Phase 1 자동 진단 — alert 마다 recommendation 1줄 함께 노출 → 사장님이
  // SMS 만 봐도 즉시 hot-fix 액션 결정 가능. SMS 길이 한도 (Solapi LMS 2000자) 안에서만.
  let smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> | null = null;
  try {
    smsResult = await sendOpsAlertSms({
      subject: `[keepioo 운영] ${alerts.length}건 임계치 초과`,
      message: alerts
        .map((a) => {
          const rec = a.recommendation ? `\n  → ${a.recommendation}` : "";
          return `- ${a.message}${rec}`;
        })
        .join("\n"),
    });
  } catch (e) {
    smsResult = {
      ok: false,
      reason: "network_error",
      error: (e as Error).message,
    };
  }

  // alert 발화 시 audit — 사장님 SMS 발송 여부 + alert 종류 기록
  await logHealthAlertRun({
    alertsCount: alerts.length,
    alertKeys: alerts.map((a) => a.key),
    signups24h: signals.signups24h,
    active7dAny: signals.active7dAny,
    newsBacklogTotal: signals.newsBacklogTotal,
    pressPending: signals.pressPending,
    pressLastClassifyHours: signals.pressLastClassifyHours,
    enrichPermanentSkip: signals.enrichPermanentSkip,
    instagramTokenExpiresInDays: signals.instagramTokenExpiresInDays,
    naverCookiesExpiresInDays: signals.naverCookiesExpiresInDays,
    smsOk: smsResult?.ok ?? null,
    smsReason: smsResult?.ok ? undefined : smsResult?.reason,
    emailOk: result.ok,
  });

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
