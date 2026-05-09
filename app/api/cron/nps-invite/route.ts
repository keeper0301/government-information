// ============================================================
// C3 — NPS 가입 7d 후 자동 설문 메일 cron.
// ============================================================
// 매일 KST 10:00 (UTC 01:00) — daily-digest/support-reminder/cancellation 직후.
// 가입 7~8일 사용자 (8d 이전 ~ 6d 이전 안에 가입) + nps_responses 미응답 +
// admin_actions.nps_invite_sent 미발송.
// 메일 1회 발송 + audit 마킹 (중복 방지).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNpsInvite } from "@/lib/notifications/nps-invite";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_LIMIT = 50;

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
  const admin = createAdminClient();
  const now = Date.now();
  const since8d = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const before6d = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();

  // 가입 7~8일 사용자 (auth.users.created_at)
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (usersErr) {
    return NextResponse.json(
      { ok: false, error: `listUsers failed: ${usersErr.message}` },
      { status: 500 },
    );
  }
  const candidates = (usersData?.users ?? [])
    .filter(
      (u) =>
        u.email &&
        u.created_at &&
        u.created_at >= since8d &&
        u.created_at <= before6d,
    )
    .slice(0, BATCH_LIMIT);

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "정상 — 7d 가입 0건" });
  }

  const candidateIds = candidates.map((u) => u.id);

  // 이미 응답한 user_id 제외
  const { data: responded } = await admin
    .from("nps_responses")
    .select("user_id")
    .in("user_id", candidateIds);
  const respondedIds = new Set<string>(
    ((responded ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );

  // 이미 발송한 user_id 제외 (audit 추적)
  const { data: alreadySent } = await admin
    .from("admin_actions")
    .select("target_user_id")
    .eq("action", "nps_invite_sent")
    .in("target_user_id", candidateIds);
  const sentIds = new Set<string>(
    ((alreadySent ?? []) as Array<{ target_user_id: string | null }>)
      .map((r) => r.target_user_id)
      .filter((v): v is string => !!v),
  );

  let sent = 0;
  let failed = 0;
  for (const u of candidates) {
    if (!u.email || respondedIds.has(u.id) || sentIds.has(u.id)) continue;

    const result = await sendNpsInvite({ email: u.email, userId: u.id });
    if (result.ok) {
      sent += 1;
      try {
        await logAdminAction({
          actorId: null,
          targetUserId: u.id,
          action: "nps_invite_sent",
          details: { sent_at: new Date().toISOString() },
        });
      } catch (e) {
        console.warn("[nps-invite] audit 실패:", e);
      }
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    candidates: candidates.length,
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
