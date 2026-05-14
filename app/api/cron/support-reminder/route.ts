// ============================================================
// Phase 4-C — 24h 미답변 support_tickets SMS reminder cron.
// ============================================================
// 매일 KST 09:15 (UTC 00:15) — daily-digest 직후 발송.
// 24h 넘게 status='open' + reminder_sent_at IS NULL 인 ticket 발견 시
// 사장님 휴대폰 SMS 1건 (가장 오래된 ticket + 대기 N건 합계).
// reminder_sent_at 마킹으로 중복 발송 방지.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

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
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 24h 넘는 미답변 ticket — 가장 오래된 것 우선 (FIFO 처리 권장)
  const { data: stale, error } = await admin
    .from("support_tickets")
    .select("id, intent, subject, message, contact_email, created_at")
    .eq("status", "open")
    .lt("created_at", since24h)
    .is("reminder_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    await auditCronRun("support_reminder_run", {
      error: `query_failed: ${error.message}`,
    });
    return NextResponse.json(
      { ok: false, error: `query_failed: ${error.message}` },
      { status: 500 },
    );
  }

  const tickets = stale ?? [];
  if (tickets.length === 0) {
    // 2026-05-14 — 빈손 분기 audit (cron 가동 흔적 보장)
    await auditCronRun("support_reminder_run", {
      stale_tickets: 0,
      sent: false,
    });
    return NextResponse.json({ ok: true, sent: false, count: 0, message: "정상 — 미답변 ticket 없음" });
  }

  // SMS 본문 — 가장 오래된 1건 + 대기 N건. 90자 안에 압축.
  const oldest = tickets[0];
  const preview = (oldest.subject || oldest.message || "").slice(0, 60);
  const subject = `[keepioo] CS 미답변 ${tickets.length}건`;
  const message = [
    `오래된 문의: ${preview}`,
    `intent: ${oldest.intent}`,
    `→ /admin/support`,
  ].join("\n");

  const smsResult = await sendOpsAlertSms({ subject, message });

  // 발송 성공 시만 reminder_sent_at 마킹 (실패면 다음 cron 에서 재시도)
  if (smsResult.ok) {
    const ids = tickets.map((t) => t.id as string);
    await admin
      .from("support_tickets")
      .update({ reminder_sent_at: new Date().toISOString() })
      .in("id", ids);
  }

  // 2026-05-14 — cron 가동 흔적 audit (가시성 강화)
  await auditCronRun("support_reminder_run", {
    stale_tickets: tickets.length,
    sent: smsResult.ok,
    sms_reason: smsResult.ok === false ? smsResult.reason : undefined,
  });

  return NextResponse.json({
    ok: smsResult.ok,
    sent: smsResult.ok,
    count: tickets.length,
    sms: smsResult,
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
