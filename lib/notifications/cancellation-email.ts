// ============================================================
// A2 — 결제 해지 사용자 자동 재가입 안내 메일 (Resend).
// ============================================================
// 매일 cron 으로 24h 안 cancelled_at 발생 사용자에게 1회만 발송.
// admin_actions.cancellation_followup_sent 로 중복 방지.

import { Resend } from "resend";

const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";

export type CancellationEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

export async function sendCancellationFollowup(opts: {
  email: string;
  tier: string;
}): Promise<CancellationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "skipped_no_credentials" };
  if (!opts.email) return { ok: false, reason: "no_email" };

  const subject = "[keepioo] 구독 해지 안내 + 재가입 혜택";
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="font-size: 18px; color: #191f28; margin-bottom: 16px;">정책알리미 구독 해지가 처리됐어요</h2>
    <p style="font-size: 14px; color: #191f28; line-height: 1.6;">
      ${escapeHtml(opts.tier)} 플랜 정기 결제가 해지됐습니다. 현재 결제 주기 만료까지는 모든 기능 그대로 이용 가능해요.
    </p>
    <div style="margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; font-size: 13px; color: #4e5968; line-height: 1.6;">
      <strong>해지 후에도 이용 가능</strong><br />
      • 정책 검색·블로그·뉴스 무제한 (Free 플랜)<br />
      • 즐겨찾기·알림 구독 그대로 유지<br />
      • 30일 안 재가입 시 기존 자격 진단 결과 복원
    </div>
    <p style="font-size: 14px; color: #191f28; line-height: 1.6; margin-top: 20px;">
      혹시 불편한 점이 있으셨다면 회신 부탁드려요. 사장님이 직접 검토합니다.
    </p>
    <a href="https://www.keepioo.com/pricing" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #3182f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
      재가입 + 마감 임박 알림 받기 →
    </a>
    <p style="color: #8b95a1; font-size: 12px; margin-top: 24px;">
      이 메일은 keepioo 의 자동 응대 시스템이 1회만 발송합니다.
    </p>
  </div>`;

  const text = [
    "정책알리미 구독 해지가 처리됐어요",
    `${opts.tier} 플랜 정기 결제 해지 — 현재 결제 주기 만료까지 모든 기능 그대로 이용 가능합니다.`,
    "",
    "해지 후에도 이용 가능:",
    "- 정책 검색·블로그·뉴스 무제한 (Free 플랜)",
    "- 즐겨찾기·알림 구독 그대로 유지",
    "- 30일 안 재가입 시 기존 자격 진단 결과 복원",
    "",
    "재가입: https://www.keepioo.com/pricing",
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: opts.email,
      subject,
      html,
      text,
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
