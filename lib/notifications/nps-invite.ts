// ============================================================
// C3 — NPS 가입 7d 후 자동 설문 메일 (Resend + token link).
// ============================================================
// 5단 점수 link 메일. 각 link 가 /api/nps/submit?u=...&t=...&s=N — GET 1회 응답.

import { Resend } from "resend";
import { generateNpsToken } from "@/lib/nps/token";

const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";
const SITE_BASE = "https://www.keepioo.com";

export type NpsInviteResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

export async function sendNpsInvite(opts: {
  email: string;
  userId: string;
}): Promise<NpsInviteResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "skipped_no_credentials" };
  if (!opts.email || !opts.userId) return { ok: false, reason: "missing_input" };

  const token = generateNpsToken(opts.userId);
  const baseUrl = `${SITE_BASE}/api/nps/submit`;
  const link = (score: number) =>
    `${baseUrl}?u=${encodeURIComponent(opts.userId)}&t=${token}&s=${score}`;

  const labels = [
    { score: 1, emoji: "😞", text: "매우 불만족" },
    { score: 2, emoji: "😐", text: "불만족" },
    { score: 3, emoji: "🙂", text: "보통" },
    { score: 4, emoji: "😊", text: "만족" },
    { score: 5, emoji: "🤩", text: "매우 만족" },
  ];

  const buttons = labels
    .map(
      (l) =>
        `<a href="${link(l.score)}" style="display: inline-block; margin: 4px; padding: 12px 16px; background: #f9fafb; color: #191f28; text-decoration: none; border: 1px solid #e5e8eb; border-radius: 8px; font-size: 14px;">${l.emoji} ${l.text}</a>`,
    )
    .join("");

  const subject = "[keepioo] 사용 경험 어떠셨어요? 1초 평가 부탁드립니다";
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="font-size: 18px; color: #191f28; margin-bottom: 16px;">정책알리미 사용 경험은 어떠셨어요?</h2>
    <p style="font-size: 14px; color: #4e5968; line-height: 1.6;">
      가입 후 1주일이 지났어요. 사장님 1인 운영 서비스라 사용자 한 분 한 분의 의견이 매우 중요합니다.
      아래 버튼 1번 클릭이면 끝납니다.
    </p>
    <div style="margin-top: 24px; text-align: center;">${buttons}</div>
    <p style="font-size: 13px; color: #8b95a1; margin-top: 24px; line-height: 1.6;">
      자유 의견은 이 메일에 답장 부탁드려요. 한 줄도 환영합니다.
    </p>
    <p style="font-size: 12px; color: #b0b8c1; margin-top: 16px;">
      이 메일은 keepioo 가입 후 1회만 발송됩니다.
    </p>
  </div>`;

  const text = [
    "정책알리미 사용 경험은 어떠셨어요?",
    "가입 후 1주일 후 1회 자동 발송 메일입니다.",
    "",
    ...labels.map((l) => `${l.emoji} ${l.text} — ${link(l.score)}`),
    "",
    "자유 의견은 이 메일에 답장 부탁드립니다.",
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
