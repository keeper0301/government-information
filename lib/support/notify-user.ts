// ============================================================
// Phase 4-B 사용자 답변 메일 발송 — Resend 통합.
// ============================================================
// 자동 응답 (auto_response) 즉시 발송 + 사장님 manual reply 시점 발송 둘 다 사용.
// RESEND_API_KEY 미설정 시 graceful skip (build/dev 보호).

import { Resend } from "resend";

const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";

export type NotifyResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

export async function sendSupportReply(opts: {
  email: string;
  ticketId: string;
  subject: string | null;
  reply: string;
}): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "skipped_no_credentials" };
  if (!opts.email) return { ok: false, reason: "no_email" };

  const subjectLine = opts.subject
    ? `[keepioo CS] Re: ${opts.subject.slice(0, 60)}`
    : "[keepioo CS] 답변 도착";

  const replyHtml = escapeHtml(opts.reply).replace(/\n/g, "<br />");
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; color: #191f28;">안녕하세요. keepioo CS 입니다.</p>
    <div style="white-space: pre-wrap; padding: 16px; background: #f9fafb; border-radius: 8px; font-size: 14px; color: #191f28; line-height: 1.6;">${replyHtml}</div>
    <p style="color: #8b95a1; font-size: 12px; margin-top: 20px;">문의 ID: ${opts.ticketId}</p>
    <p style="color: #8b95a1; font-size: 12px;">추가 문의는 이 메일에 답장 또는 keepioo.com/support 에 다시 작성해 주세요.</p>
  </div>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: opts.email,
      subject: subjectLine,
      html,
      text: opts.reply,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, messageId: data?.id };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
