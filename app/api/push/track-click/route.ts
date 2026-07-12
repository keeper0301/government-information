// ============================================================
// POST /api/push/track-click — PWA 푸시 클릭 추적 (Spec 3)
// ============================================================
// service worker (sw.js) 의 notificationclick 이벤트가 호출.
// push_notification_log.clicked_at + click_hour_kst update.
// push-time-learn cron 이 이 데이터를 사용해 시간대별 click_rate 학습.
//
// 보안 (2026-05-27 P1-1 review fix):
//   - logId 1..N brute-force POST 공격 차단 위해 HMAC token verify.
//   - send.ts 가 payload.data.token = signPushLogId(logId) 동봉 → sw 가
//     endpoint POST 에 logId + token 둘 다 전송 → verifyPushLogToken 검증.
//   - 검증 실패 시 401 (verbose 누설 X).
//   - 이미 click marked row 는 멱등 skip (같은 알림 반복 클릭 시 첫 클릭만).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPushLogToken } from "@/lib/push/track-token";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";

export const dynamic = "force-dynamic";
const MAX_PUSH_TRACK_BODY_BYTES = 2 * 1024;

function nowHourKst(): number {
  const utc = new Date();
  return new Date(utc.getTime() + 9 * 3600_000).getUTCHours();
}

export async function POST(request: Request) {
  try {
    const body = await readJsonWithLimit<{ logId?: number | string; token?: string }>(
      request,
      MAX_PUSH_TRACK_BODY_BYTES,
    );
    const logId =
      typeof body.logId === "number"
        ? body.logId
        : typeof body.logId === "string"
          ? Number(body.logId)
          : NaN;
    if (!Number.isFinite(logId) || logId <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_logId" }, { status: 400 });
    }
    if (!verifyPushLogToken(logId, body.token)) {
      return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
    }

    const admin = createAdminClient();
    // 이미 click marking 된 row 는 skip (멱등 + idempotent — 같은 알림 반복 클릭 시 첫 클릭만).
    const { error } = await admin
      .from("push_notification_log")
      .update({
        clicked_at: new Date().toISOString(),
        click_hour_kst: nowHourKst(),
      })
      .eq("id", logId)
      .is("clicked_at", null);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isJsonBodyTooLargeError(e)) {
      return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
    }
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
