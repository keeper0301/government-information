// ============================================================
// 주간 다이제스트 메일 — Phase 5 A4
// ============================================================
// 매주 월요일 09:00 KST cron 이 알림 규칙 없는 사용자 + 마케팅 동의 사용자에게
// 이번 주 hot 정책 5건 묶어서 발송.
// HTML 패턴은 lib/email.ts 의 sendCustomAlertEmail 답습 (토스 TDS 라이트).
// ============================================================

import { Resend } from "resend";
import type { WeeklyDigestProgram } from "@/lib/digest/weekly";

const FROM_ADDRESS = "정책알리미 <noreply@keepioo.com>";
const ADMIN_EMAIL = "keeper0301@gmail.com";

// Resend 인스턴스 lazy 초기화 — 빌드 시점에 키 없어도 통과 (실제 호출 시 throw).
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  _resend = new Resend(key);
  return _resend;
}

// 메일 본문에 사용자 입력·정책 제목 박을 때 XSS·렌더 깨짐 방지.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

interface SendWeeklyDigestEmailParams {
  to: string;
  programs: WeeklyDigestProgram[];
}

// ============================================================
// 메일 발송
// ============================================================
// programs 가 비어 있으면 발송 스킵 (cron 단에서 빈 결과면 호출조차 안 하지만 안전 가드).
// 결과는 Resend 표준 { data, error } 반환 — onboarding 패턴(ok/error) 대신
// alert-dispatch 패턴 답습해 cron 라우트가 에러 객체로 분기 가능하도록.
// ============================================================
export async function sendWeeklyDigestEmail({
  to,
  programs,
}: SendWeeklyDigestEmailParams): Promise<{
  data: { id: string } | null;
  error: { message: string } | null;
}> {
  if (programs.length === 0) {
    return { data: null, error: null };
  }

  // 정책 카드 5개 — 토스 TDS 라이트 (lib/email.ts sendCustomAlertEmail 참고).
  const rows = programs
    .map((p) => {
      const typeLabel = p.type === "welfare" ? "복지" : "대출";
      const typePath = p.type === "welfare" ? "welfare" : "loan";
      const safeTitle = escapeHtml(p.title);
      const safeSource = escapeHtml(p.source ?? "");
      const deadline = p.apply_end ? `마감 ${escapeHtml(p.apply_end)}` : "상시";
      const url = `https://www.keepioo.com/${typePath}/${p.id}`;
      return `
        <div style="padding: 16px; border-bottom: 1px solid #e5e8eb;">
          <div style="font-size: 11px; font-weight: 700; color: #3182f6; margin-bottom: 4px;">${typeLabel} · ${safeSource}</div>
          <a href="${url}" style="font-size: 16px; font-weight: 700; color: #191f28; text-decoration: none;">${safeTitle}</a>
          <div style="font-size: 13px; color: #8b95a1; margin-top: 4px;">${deadline}</div>
          <a href="${url}" style="display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 600; color: #3182f6; text-decoration: none;">자세히 보기 →</a>
        </div>
      `;
    })
    .join("");

  // 푸터:
  //   - 발송 사유 명시: "알림 규칙 없는 분께 매주 월요일"
  //   - "맞춤 알림 받기" → /mypage/notifications
  //   - "수신 거부" → /mypage (마케팅 동의 철회는 마이페이지 동의 관리 패널)
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="margin-bottom: 16px;">
        <span style="font-size: 18px; font-weight: 800; color: #191f28;">keepioo 정책알리미</span>
      </div>
      <div style="background: #f0f7ff; border-radius: 16px; padding: 20px 24px; margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 600; color: #3182f6; margin-bottom: 6px;">📬 주간 정책 다이제스트</div>
        <div style="font-size: 18px; font-weight: 700; color: #191f28;">이번 주 새 정책 ${programs.length}건</div>
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e8eb; border-radius: 12px;">
        ${rows}
      </div>
      <div style="margin-top: 24px; padding: 16px 20px; background: #f9fafb; border-radius: 12px;">
        <div style="font-size: 13px; font-weight: 600; color: #191f28; margin-bottom: 8px;">내 자격에 맞는 정책만 받고 싶다면?</div>
        <a href="https://www.keepioo.com/mypage/notifications" style="display: inline-block; padding: 10px 20px; background: #3182f6; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600;">
          맞춤 알림 받기 →
        </a>
      </div>
      <div style="margin-top: 24px; font-size: 12px; color: #8b95a1; line-height: 1.7;">
        이 메일은 알림 규칙이 없는 회원께 매주 월요일 1회 발송되는 정책 다이제스트입니다.<br />
        수신을 원하지 않으시면 <a href="https://www.keepioo.com/mypage" style="color: #3182f6;">마이페이지 → 동의 관리</a> 에서 마케팅 수신 동의를 해제할 수 있어요.
      </div>
    </div>
  `;

  const text = `keepioo 주간 정책 다이제스트 — 이번 주 새 정책 ${programs.length}건\n\n${programs
    .map((p) => {
      const typeLabel = p.type === "welfare" ? "[복지]" : "[대출]";
      const deadline = p.apply_end ? `마감 ${p.apply_end}` : "상시";
      return `${typeLabel} ${p.title} (${deadline})\nhttps://www.keepioo.com/${p.type}/${p.id}`;
    })
    .join("\n\n")}\n\n맞춤 알림 받기: https://www.keepioo.com/mypage/notifications\n수신 거부: https://www.keepioo.com/mypage`;

  const { data, error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: [to],
    replyTo: ADMIN_EMAIL,
    subject: `[키피오] 이번 주 새 정책 ${programs.length}건 — 주간 다이제스트`,
    html,
    text,
  });

  return { data, error };
}
