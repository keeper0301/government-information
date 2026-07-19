import { NextResponse } from "next/server";
import { Resend } from "resend";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import {
  buildContactReminderEmail,
  collectContactReminderDigest,
  formatContactReminderText,
  kstDateString,
  summarizeContactReminderDigest,
} from "@/lib/notifications/user-contact-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAIL = "keeper0301@gmail.com";
const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";

async function run(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1" || url.searchParams.get("dry_run") === "1";
  const logSafe = dryRun || url.searchParams.get("log_safe") === "1";
  const today = kstDateString();
  const digest = await collectContactReminderDigest({ today });
  const summary = summarizeContactReminderDigest(digest);

  const telegram = dryRun
    ? ({ ok: false, reason: "dry_run" } as const)
    : await sendOpsAlertTelegram({
        subject: "[keepioo] 오늘 연락할 사용자",
        message: formatContactReminderText(digest),
      });
  const email = dryRun ? ({ ok: false, reason: "dry_run" } as const) : await sendEmailDigest(digest);
  const anyDelivered = telegram.ok || email.ok;

  await auditCronRun("user_contact_reminder_run", {
    today,
    dry_run: dryRun,
    log_safe: logSafe,
    total_due: digest.totalDue,
    due_today: digest.dueToday.length,
    overdue: digest.overdue.length,
    telegram_ok: telegram.ok,
    telegram_reason: telegram.ok ? undefined : telegram.reason,
    email_ok: email.ok,
    email_reason: email.ok ? undefined : email.reason,
    any_delivered: anyDelivered,
  });

  return NextResponse.json({
    ok: true,
    mode: dryRun ? "dry_run" : "send",
    logSafe,
    today,
    digest: logSafe ? undefined : digest,
    summary,
    telegram,
    email,
    anyDelivered,
  });
}

async function sendEmailDigest(digest: Awaited<ReturnType<typeof collectContactReminderDigest>>): Promise<
  | { ok: true; sent: true }
  | { ok: false; reason: "skipped_no_credentials" }
  | { ok: false; reason: "api_error"; error: string }
  | { ok: false; reason: "network_error"; error: string }
> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "skipped_no_credentials" };

  const { subject, html, text } = buildContactReminderEmail(digest);
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
      return { ok: false, reason: "api_error", error: error.message };
    }
    return { ok: true, sent: true };
  } catch (error) {
    return {
      ok: false,
      reason: "network_error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run(request);
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run(request);
}
