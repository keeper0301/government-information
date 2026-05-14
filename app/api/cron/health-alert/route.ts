// app/api/cron/health-alert/route.ts
// Phase 6 — 매일 09:00 KST 임계치 점검 cron.
// 위반 항목 ≥ 1 면 사장님 이메일 발송 (사고 조기 감지).
// vercel.json crons 에 등록: { "path": "/api/cron/health-alert", "schedule": "0 0 * * *" }

import { NextResponse } from "next/server";
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { sendHealthAlertEmail } from "@/lib/email";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction } from "@/lib/admin-actions";
import {
  getRecentlyFiredAlertKeys,
  filterAlertsByCooldown,
} from "@/lib/alerts/cooldown";

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
  // 2026-05-14 추가 — 실제 SMS 발송된 key 만. cooldown filter 가 이 필드만 봐야
  // cooldown 영구 mute 사고 차단 (codex P1 fix).
  smsAlertKeys?: string[];
  suppressedByCooldown?: string[];
  cooldownAllSuppressed?: boolean;
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
  // 2026-05-14 추가 — SMS 실패 진단 정보 (api_error 의 구체 error 메시지).
  // 5/9 11:11 부터 SMS 5일 다운 사고 진단 시 reason="api_error" 만 있어 무력했음.
  smsError?: string;
  // 2026-05-14 추가 — 텔레그램 fallback 발송 결과 (SMS 다운 시 메타 안전책).
  telegramOk?: boolean | null;
  telegramReason?: string;
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

  // cooldown — 같은 alert key 가 72h 안 발화됐으면 SMS skip (subagent Critical-2 fix).
  // audit 은 항상 기록, SMS 만 필터링. ALERT_COOLDOWN_HOURS=0 으로 비활성 가능.
  const recentlyFired = await getRecentlyFiredAlertKeys();
  const { smsAlerts, suppressedKeys } = filterAlertsByCooldown(
    alerts,
    recentlyFired,
  );

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
  // smsAlerts 가 비어있으면 SMS skip — 모든 alert 가 cooldown 으로 suppress.
  // 2026-05-14 — sendOpsAlertMultichannel helper 로 SMS + 텔레그램 단일 진입점.
  // 메타 안전책 (5/9~5/14 SMS 5일 다운 사고) — 잔액 0 시 텔레그램 fallback 자동.
  // 새 채널 추가 시 helper 1줄만 수정.
  let multi: Awaited<ReturnType<typeof sendOpsAlertMultichannel>> | null = null;
  let cooldownAllSuppressed = false;
  if (smsAlerts.length > 0) {
    const subject = `[keepioo 운영] ${smsAlerts.length}건 임계치 초과${
      suppressedKeys.length > 0 ? ` (${suppressedKeys.length}건 cooldown)` : ""
    }`;
    const message = smsAlerts
      .map((a) => {
        const rec = a.recommendation ? `\n  → ${a.recommendation}` : "";
        return `- ${a.message}${rec}`;
      })
      .join("\n");
    multi = await sendOpsAlertMultichannel({ subject, message });
  } else {
    // 모든 alert 가 cooldown 으로 suppress — 발송 skip.
    cooldownAllSuppressed = true;
  }
  const smsResult = multi?.sms ?? null;
  const telegramResult = multi?.telegram ?? null;

  // alert 발화 시 audit — 사장님 SMS 발송 여부 + alert 종류 기록
  // smsAlertKeys 별도 — cooldown filter 가 이 필드만 봐서 영구 mute 차단 (codex P1).
  await logHealthAlertRun({
    alertsCount: alerts.length,
    alertKeys: alerts.map((a) => a.key),
    smsAlertKeys: smsAlerts.map((a) => a.key),
    suppressedByCooldown: suppressedKeys,
    cooldownAllSuppressed,
    signups24h: signals.signups24h,
    active7dAny: signals.active7dAny,
    newsBacklogTotal: signals.newsBacklogTotal,
    pressPending: signals.pressPending,
    pressLastClassifyHours: signals.pressLastClassifyHours,
    enrichPermanentSkip: signals.enrichPermanentSkip,
    instagramTokenExpiresInDays: signals.instagramTokenExpiresInDays,
    naverCookiesExpiresInDays: signals.naverCookiesExpiresInDays,
    smsOk: cooldownAllSuppressed ? null : (smsResult?.ok ?? null),
    smsReason: cooldownAllSuppressed
      ? "cooldown_all_suppressed"
      : smsResult?.ok
        ? undefined
        : smsResult?.reason,
    // 2026-05-14 — SMS 실패 진단 정보 (api_error 의 구체 메시지) audit 보존.
    // 5/9 사고 (api_error 5일 지속) 진단 가속.
    smsError: !cooldownAllSuppressed && smsResult && !smsResult.ok && smsResult.reason !== "skipped_no_credentials"
      ? smsResult.error
      : undefined,
    // 2026-05-14 — 텔레그램 fallback 결과 audit (메타 안전책 가시성).
    telegramOk: cooldownAllSuppressed ? null : (telegramResult?.ok ?? null),
    telegramReason: cooldownAllSuppressed
      ? "cooldown_all_suppressed"
      : telegramResult?.ok
        ? undefined
        : telegramResult?.reason,
    emailOk: result.ok,
  });

  return NextResponse.json({
    ok: result.ok,
    sent: result.ok,
    alerts,
    smsAlerts: smsAlerts.map((a) => a.key),
    suppressedByCooldown: suppressedKeys,
    cooldownAllSuppressed,
    signals,
    sms: smsResult,
    telegram: telegramResult,
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
