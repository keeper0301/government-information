// ============================================================
// 주간 정책 다이제스트 cron — Phase 5 A4
// ============================================================
// 매주 월요일 09:00 KST (= UTC 00:00) 실행.
// 알림 규칙 없는 사용자 + 마케팅 동의 활성 사용자에게 이번 주 hot 정책 5건 묶어
// 메일 1통 발송.
// alert-dispatch 와 발송 대상 중복 0 — A4 핵심 가치.
// ============================================================
// vercel.json crons: { "path": "/api/cron/weekly-digest", "schedule": "0 0 * * 1" }
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";
import { sendWeeklyDigestEmail } from "@/lib/email/weekly-digest";
import { loadHotPrograms, loadRecipients } from "@/lib/digest/weekly";

// 사용자 수가 늘어도 1회 발송이라 5분 한도면 충분 (Resend 1통당 ~수백 ms).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 이메일 발송 동시 실행 갯수 — 너무 큰 batch 는 Resend rate limit 위험.
// 토스 patterns 따라 5건씩 끊어서 보냄.
const SEND_BATCH = 5;

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
  const jobLabel = "weekly-digest";
  try {
    const admin = createAdminClient();

    // 1) hot 정책 + 발송 대상 병렬 로드 — 둘은 서로 독립.
    const [programs, recipients] = await Promise.all([
      loadHotPrograms(admin),
      loadRecipients(admin, admin),
    ]);

    // hot 정책 0건이면 발송 스킵 — 빈 메일 보내면 사용자 신뢰 손상.
    if (programs.length === 0) {
      return NextResponse.json({
        ok: true,
        recipients: recipients.length,
        programs: 0,
        sent: 0,
        failed: 0,
        note: "hot 정책 0건 — 발송 스킵",
      });
    }

    if (recipients.length === 0) {
      return NextResponse.json({
        ok: true,
        recipients: 0,
        programs: programs.length,
        sent: 0,
        failed: 0,
        note: "발송 대상 0명",
      });
    }

    // 2) batch 5건씩 병렬 발송 — Resend rate limit 안전.
    let sent = 0;
    let failed = 0;
    const failureDetail: string[] = [];

    for (let i = 0; i < recipients.length; i += SEND_BATCH) {
      const batch = recipients.slice(i, i + SEND_BATCH);
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            const { error } = await sendWeeklyDigestEmail({
              to: r.email,
              programs,
            });
            if (error) {
              return { ok: false, detail: `${r.email}: ${String(error.message ?? error).slice(0, 120)}` };
            }
            return { ok: true };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, detail: `${r.email}: ${msg.slice(0, 120)}` };
          }
        }),
      );

      for (const result of results) {
        if (result.ok) {
          sent++;
        } else {
          failed++;
          if (failureDetail.length < 10 && result.detail) {
            failureDetail.push(result.detail);
          }
        }
      }
    }

    // 발송 실패가 1건이라도 있으면 운영자 알림 — 같은 (job, signature) 24h dedupe 가
    // notifyCronFailure 안에서 작동해 폭주 방지.
    if (failed > 0) {
      await notifyCronFailure(
        `${jobLabel} - 이메일 발송 실패 ${failed}건`,
        failureDetail.join("\n"),
      );
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      recipients: recipients.length,
      programs: programs.length,
      sent,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json(
      { error: "주간 다이제스트 발송 실패", detail: message },
      { status: 500 },
    );
  }
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
