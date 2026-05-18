// ============================================================
// /api/cron/adsense-review-watch — AdSense 검수 결과 자동 감지 (2026-05-18)
// ============================================================
// 사장님 5/18 재신청 후 검수 5~14일 대기. 매일 polling 으로 account.state
// 전환 감지 → 승인/거절 시 즉시 텔레그램+SMS.
//
// 기존 external-console-check cron 은 state != READY 면 매일 동일 alert 반복.
// 14일 검수면 14건 폭주. 이 cron 은 **전환** 만 감지 (state 변경된 순간만).
//
// State 분류 (AdSense API):
//   READY            — 정상 (광고 게재 가동)
//   NEEDS_ATTENTION  — 검수 중 또는 정책 위반 fix 필요
//   WARNING          — 경고 (광고 게재 일시 중단 가능)
//   DISABLED         — 정지 (거절 또는 정책 위반 정지)
//   CLOSED           — 종료
//   NOT_FOUND        — 계정 없음 (publisher ID 미연결 또는 OAuth 실패)
//
// 전환 신호:
//   * → READY              = 승인 🎉 (5/18 재신청 결과 GO)
//   * → DISABLED/CLOSED    = 거절 (즉시 사유 확인 필요)
//   READY → WARNING        = 광고 일시 중단 (즉시 fix)
//   변화 없음              = noop (audit 만 — 진단성)
//
// audit: admin_actions.adsense_review_state (state + previous + transition)
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdsense } from "@/lib/external-console/adsense";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AdSenseState =
  | "READY"
  | "NEEDS_ATTENTION"
  | "WARNING"
  | "DISABLED"
  | "CLOSED"
  | "NOT_FOUND"
  | "UNKNOWN";

// 직전 state 조회 — admin_actions 최신 adsense_review_state row.
// 없으면 null 반환 (cron 첫 가동 시).
async function getPreviousState(): Promise<AdSenseState | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "adsense_review_state")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) return null;
  const state = (data.details as { state?: string } | null)?.state;
  return (state as AdSenseState) ?? null;
}

// 전환별 사장님 알림 메시지 + 우선순위 분기.
export function buildTransitionAlert(input: {
  previous: AdSenseState | null;
  current: AdSenseState;
}): { shouldAlert: boolean; subject: string; message: string } | null {
  const { previous, current } = input;

  // 첫 가동 — previous 가 null 이면 audit 만, alert 안 함 (baseline 수립).
  if (previous === null) return null;

  // 동일 state — noop.
  if (previous === current) return null;

  // 승인 — READY 전환.
  if (current === "READY") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 승인 통과 🎉",
      message: [
        `AdSense 검수 결과: 승인.`,
        `account.state ${previous} → READY 전환 감지.`,
        ``,
        `[다음 액션]`,
        `1. Vercel env 에 ADSENSE_PUBLISHER_ID 등록`,
        `2. ads.txt 노출 확인 (curl https://www.keepioo.com/ads.txt)`,
        `3. /admin/external-console 의 AdSense 카드 READY 확인`,
        `4. 1주차 모니터링 (수익 누적, 광고 게재 비율)`,
      ].join("\n"),
    };
  }

  // 거절 — DISABLED/CLOSED 전환.
  if (current === "DISABLED" || current === "CLOSED") {
    return {
      shouldAlert: true,
      subject: `[keepioo] AdSense 거절 (${current})`,
      message: [
        `AdSense 검수 결과: 거절.`,
        `account.state ${previous} → ${current} 전환 감지.`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com → 사이트 keepioo.com → 거절 사유 확인`,
        `2. 사유별 fix 적용 (메모리 [adsense-rejection-response] 참조)`,
        `3. 1~2주 fix 누적 후 재신청`,
      ].join("\n"),
    };
  }

  // 경고 — READY → WARNING/NEEDS_ATTENTION 전환 (광고 일시 중단 risk).
  if (previous === "READY") {
    return {
      shouldAlert: true,
      subject: `[keepioo] AdSense 경고 (${current})`,
      message: [
        `AdSense 정상 운영 중 경고 감지.`,
        `account.state READY → ${current} 전환.`,
        ``,
        `즉시 https://adsense.google.com 에서 정책 위반·결제 정보 점검 필요.`,
      ].join("\n"),
    };
  }

  // 기타 전환 (예: NEEDS_ATTENTION → WARNING) — 정보 알림.
  return {
    shouldAlert: true,
    subject: `[keepioo] AdSense state 전환 (${current})`,
    message: `account.state ${previous} → ${current} 전환 감지. 검수 진행 신호일 수 있음.`,
  };
}

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
  // checkAdsense 가 OAuth env 없으면 graceful skip — 그 경우 cron 도 skip.
  const result = await checkAdsense();
  if (result.error?.startsWith("skipped:")) {
    return NextResponse.json({ ok: true, skipped: result.error });
  }

  const current = (result.kpis.account_state as AdSenseState) ?? "UNKNOWN";
  const previous = await getPreviousState();
  const transition = buildTransitionAlert({ previous, current });

  // audit — 매 cron 마다 기록 (전환 history 추적 + 직전 state lookup 용).
  await logAdminAction({
    actorId: null,
    action: "adsense_review_state" as AdminActionType,
    details: {
      state: current,
      previous,
      transition: transition?.shouldAlert ? "alerted" : "noop",
      account_name: result.kpis.account_name ?? null,
    },
  });

  // 전환 감지 시 알림.
  if (transition?.shouldAlert) {
    await sendOpsAlertMultichannel({
      subject: transition.subject,
      message: transition.message,
      link: "https://adsense.google.com/",
    });
  }

  return NextResponse.json({
    ok: true,
    current,
    previous,
    alerted: transition?.shouldAlert ?? false,
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
