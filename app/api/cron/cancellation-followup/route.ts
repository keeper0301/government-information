// ============================================================
// A2 — 결제 해지 사용자 자동 재가입 안내 cron.
// ============================================================
// 매일 KST 09:30 (UTC 00:30) 실행 — daily-digest/support-reminder 직후.
// 24h 안 subscriptions.cancelled_at 발생 + admin_actions.cancellation_followup_sent
// 미발송 사용자에게 1회 메일 + audit 마킹.
// 사용자 retention 시도 + 사장님 큐 부담 0 (자동 메일).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCancellationFollowup } from "@/lib/notifications/cancellation-email";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 24h 안 해지 사용자
  const { data: cancelled, error } = await admin
    .from("subscriptions")
    .select("user_id, tier, cancelled_at")
    .gte("cancelled_at", since24h);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `query_failed: ${error.message}` },
      { status: 500 },
    );
  }

  const tickets = cancelled ?? [];
  if (tickets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "정상 — 24h 해지 0건" });
  }

  // 이미 발송 완료된 user_id 제외 (중복 방지)
  const { data: alreadySent } = await admin
    .from("admin_actions")
    .select("target_user_id")
    .eq("action", "cancellation_followup_sent")
    .gte("created_at", since24h);
  const sentUserIds = new Set<string>(
    ((alreadySent ?? []) as Array<{ target_user_id: string | null }>)
      .map((r) => r.target_user_id)
      .filter((v): v is string => !!v),
  );

  let sent = 0;
  let failed = 0;
  for (const s of tickets as Array<{
    user_id: string;
    tier: string;
    cancelled_at: string;
  }>) {
    if (!s.user_id || sentUserIds.has(s.user_id)) continue;

    // user email 조회
    const { data: ud } = await admin.auth.admin.getUserById(s.user_id);
    const email = ud?.user?.email;
    if (!email) {
      failed += 1;
      continue;
    }

    const result = await sendCancellationFollowup({
      email,
      tier: s.tier ?? "구독",
    });
    if (result.ok) {
      sent += 1;
      try {
        await logAdminAction({
          actorId: null,
          targetUserId: s.user_id,
          action: "cancellation_followup_sent",
          details: { tier: s.tier, cancelled_at: s.cancelled_at },
        });
      } catch (auditErr) {
        // audit 실패해도 메일은 이미 보냄. 다음 cron 에서 중복 발송 가능성 — 작은 비용
        console.warn("[cancellation-followup] audit 실패:", auditErr);
      }
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: tickets.length,
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
