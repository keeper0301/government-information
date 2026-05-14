// app/api/cron/weekly-ops-digest/route.ts
// 어드민 자동화 마스터 #4 — 사장님 weekly-ops 이메일 다이제스트.
// 매주 화요일 KST 09:00 (UTC '0 0 * * 2'). 사용자용 weekly-digest (월요일) 와 충돌 회피.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  collectWeeklyOpsDigest,
  buildWeeklyOpsHtml,
  fetchAutoConfirmSample,
} from "@/lib/notifications/weekly-ops-digest";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAIL = "keeper0301@gmail.com";
const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";

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

async function run(): Promise<NextResponse> {
  // KPI + audit 샘플 병렬 fetch
  const [data, auditSample] = await Promise.all([
    collectWeeklyOpsDigest(),
    fetchAutoConfirmSample(),
  ]);
  const { subject, html, text } = buildWeeklyOpsHtml(data, auditSample);

  // RESEND_API_KEY 미설정 시 graceful skip — build/dev 보호
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 2026-05-14 — skipped 분기에도 audit (cron 가동 흔적 보장)
    await auditCronRun("weekly_ops_digest_run", {
      skipped: "RESEND_API_KEY not configured",
    });
    return NextResponse.json({
      ok: true,
      sent: false,
      data,
      note: "RESEND_API_KEY 미설정 — skipped",
    });
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      subject,
      html,
      text,
    });
    if (error) {
      // 2026-05-14 — 실패 분기 audit
      await auditCronRun("weekly_ops_digest_run", {
        sent: false,
        error: error.message,
      });
      return NextResponse.json(
        { ok: false, sent: false, data, error: error.message },
        { status: 500 },
      );
    }
    // 2026-05-14 — 정상 분기 audit (사장님께 가는 주간 보고 가동 추적)
    await auditCronRun("weekly_ops_digest_run", {
      sent: true,
      subject,
    });
    return NextResponse.json({ ok: true, sent: true, data, subject });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await auditCronRun("weekly_ops_digest_run", {
      sent: false,
      error: message,
    });
    return NextResponse.json(
      { ok: false, sent: false, data, error: message },
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
