// app/api/cron/weekly-ops-digest/route.ts
// 어드민 자동화 마스터 #4 — 사장님 weekly-ops 이메일 다이제스트.
// 매주 화요일 KST 09:00 (UTC '0 0 * * 2'). 사용자용 weekly-digest (월요일) 와 충돌 회피.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  collectWeeklyOpsDigest,
  buildWeeklyOpsHtml,
} from "@/lib/notifications/weekly-ops-digest";

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
  const data = await collectWeeklyOpsDigest();
  const { subject, html, text } = buildWeeklyOpsHtml(data);

  // RESEND_API_KEY 미설정 시 graceful skip — build/dev 보호
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
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
      return NextResponse.json(
        { ok: false, sent: false, data, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, sent: true, data, subject });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        data,
        error: e instanceof Error ? e.message : String(e),
      },
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
