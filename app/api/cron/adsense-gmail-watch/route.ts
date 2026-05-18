// ============================================================
// /api/cron/adsense-gmail-watch — AdSense Gmail 이메일 자동 감지 (D 옵션)
// ============================================================
// 2026-05-18 spec [adsense-gmail-watch-spec.md] 따라 구현. Gmail OAuth env
// 등록 후 즉시 가동 (env 미설정 시 graceful skip).
//
// adsense-review-watch (state polling, KST 10:05) 와 별도 2 채널:
//   1. AdSense API state 전환 감지
//   2. Gmail AdSense 이메일 도착 감지 (이 cron)
//
// 두 채널 모두 텔레그램+SMS 발송 → 사장님 가장 빠른 채널로 검수 결과 인지.
//
// dedup: 동일 message_id 가 24h 내 audit 에 있으면 알림 skip.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkAdsenseGmail,
  type AdSenseEmailVerdict,
} from "@/lib/external-console/gmail-adsense-watch";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// verdict 별 사장님 알림 메시지 (테스트 export)
export function buildGmailVerdictAlert(input: {
  verdict: AdSenseEmailVerdict;
  subject: string;
}): { shouldAlert: boolean; subject: string; message: string } | null {
  const { verdict, subject } = input;

  if (verdict === "approved") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 승인 🎉",
      message: [
        `AdSense 이메일 도착 — 승인 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com 에서 publisher ID 확인`,
        `2. Vercel env 등록: ADSENSE_PUBLISHER_ID`,
        `3. adsense-review-watch cron 이 state=READY 자동 감지 (10:05)`,
      ].join("\n"),
    };
  }

  if (verdict === "rejected") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 거절",
      message: [
        `AdSense 이메일 도착 — 거절 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com → 거절 사유 확인`,
        `2. 메모리 [adsense-rejection-response] 따라 사유별 fix`,
        `3. 1~2주 fix 누적 후 재신청`,
      ].join("\n"),
    };
  }

  if (verdict === "violation") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 정책 위반 경고",
      message: [
        `AdSense 이메일 도착 — 정책 위반·경고 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `즉시 https://adsense.google.com 에서 위반 항목 확인 + fix.`,
      ].join("\n"),
    };
  }

  // info / unmatched — 일반 정보 알림. 사장님 알림 X.
  return null;
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

// 24h audit 에서 매칭된 message_id 가 이미 알림됐는지 확인 (중복 차단)
async function isAlreadyAlerted(matchedIds: string[]): Promise<boolean> {
  if (matchedIds.length === 0) return true;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "adsense_gmail_match")
    .gte("created_at", since)
    .limit(10);
  if (!data) return false;
  const alertedIds = new Set<string>(
    data.flatMap((r) => {
      const ids = (r.details as { matched_ids?: string[] } | null)?.matched_ids;
      return Array.isArray(ids) ? ids : [];
    }),
  );
  return matchedIds.every((id) => alertedIds.has(id));
}

async function run() {
  const result = await checkAdsenseGmail();
  if (result.error?.startsWith("skipped:")) {
    return NextResponse.json({ ok: true, skipped: result.error });
  }

  if (result.matchedIds.length === 0) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  // 알림 중복 방지 — 24h 내 동일 message_id 이미 처리
  const alreadyAlerted = await isAlreadyAlerted(result.matchedIds);

  let alerted = false;
  if (!alreadyAlerted && result.latestVerdict && result.latestSubject) {
    const verdictAlert = buildGmailVerdictAlert({
      verdict: result.latestVerdict,
      subject: result.latestSubject,
    });
    if (verdictAlert?.shouldAlert) {
      await sendOpsAlertMultichannel({
        subject: verdictAlert.subject,
        message: verdictAlert.message,
        link: "https://adsense.google.com/",
      });
      alerted = true;
    }
  }

  await logAdminAction({
    actorId: null,
    action: "adsense_gmail_match" as AdminActionType,
    details: {
      matched_ids: result.matchedIds,
      latest_verdict: result.latestVerdict,
      latest_subject: result.latestSubject?.slice(0, 200) ?? null,
      alerted,
      already_alerted: alreadyAlerted,
    },
  });

  return NextResponse.json({
    ok: true,
    matched: result.matchedIds.length,
    latest_verdict: result.latestVerdict,
    alerted,
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
