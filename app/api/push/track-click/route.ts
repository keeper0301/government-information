// ============================================================
// POST /api/push/track-click — PWA 푸시 클릭 추적 (Spec 3)
// ============================================================
// service worker (sw.js) 의 notificationclick 이벤트가 호출.
// push_notification_log.clicked_at + click_hour_kst update.
// push-time-learn cron 이 이 데이터를 사용해 시간대별 click_rate 학습.
//
// 보안:
//   - logId 는 BIGINT 라 guess 어려움
//   - 다른 user 의 logId 를 임의로 click marking 하더라도 영향은 그 user 의
//     학습 데이터에 +1 click. 부정 가치 ↓ + 학습 cron 이 user 별 독립.
//   - 추가 가드 필요 시 future: logId + signed token (HMAC) 패턴 도입.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function nowHourKst(): number {
  const utc = new Date();
  return new Date(utc.getTime() + 9 * 3600_000).getUTCHours();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { logId?: number | string };
    const logId =
      typeof body.logId === "number"
        ? body.logId
        : typeof body.logId === "string"
          ? Number(body.logId)
          : NaN;
    if (!Number.isFinite(logId) || logId <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_logId" }, { status: 400 });
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
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
