import { Resend } from "resend";

// Resend 클라이언트를 lazy 하게 초기화
// 빌드 시점에 RESEND_API_KEY 가 없어도 빌드 통과하도록 (실제 호출 시 에러)
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

// 발신자 (모든 메일 공통)
const FROM_ADDRESS = "정책알리미 <onboarding@resend.dev>";

type SendAlarmEmailParams = {
  to: string;
  programTitle: string;
  programType: "welfare" | "loan";
  programId: string;
  daysLeft: number;
  applyUrl?: string;
};

export async function sendAlarmEmail({
  to,
  programTitle,
  programType,
  programId,
  daysLeft,
  applyUrl,
}: SendAlarmEmailParams) {
  const typeLabel = programType === "welfare" ? "복지" : "대출";
  const detailUrl = `https://정책알리미.kr/${programType}/${programId}`;

  const { data, error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject: `[정책알리미] ${programTitle} 신청 마감 ${daysLeft}일 전입니다`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 800; color: #191f28;">정책알리미</span>
        </div>
        <div style="background: #f9fafb; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 600; color: #3182f6; margin-bottom: 8px;">${typeLabel} 프로그램</div>
          <div style="font-size: 20px; font-weight: 700; color: #191f28; margin-bottom: 8px;">${programTitle}</div>
          <div style="font-size: 14px; color: #f04452; font-weight: 700;">마감까지 ${daysLeft}일 남았습니다</div>
        </div>
        <p style="font-size: 15px; color: #4e5968; line-height: 1.7; margin-bottom: 24px;">
          등록하신 프로그램의 신청 마감이 ${daysLeft}일 앞으로 다가왔습니다. 아래 버튼을 눌러 자세한 내용을 확인하고 신청해주세요.
        </p>
        <a href="${applyUrl || detailUrl}" style="display: inline-block; background: #3182f6; color: #ffffff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600;">
          ${applyUrl ? "신청하러 가기" : "자세히 보기"}
        </a>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e8eb; font-size: 12px; color: #8b95a1;">
          이 이메일은 정책알리미에서 알림 등록을 하셨기 때문에 발송되었습니다.
        </div>
      </div>
    `,
  });

  return { data, error };
}

// ============================================================
// 운영자 알림 — cron 작업 실패 시
// ============================================================
// publish-blog 등 cron 이 throw 했을 때 keeper0301@gmail.com 으로 알림.
// 발행 실패가 며칠간 무음으로 쌓이는 걸 방지.
// ============================================================
type SendCronFailureEmailParams = {
  jobName: string;       // "publish-blog" / "collect" 등
  errorMessage: string;
  context?: string;      // 추가 정보 (예: 카테고리)
};

const ADMIN_EMAIL = "keeper0301@gmail.com";

// 메일 HTML 안에 신뢰할 수 없는 문자열 (AI 응답, 사용자 입력) 박을 때
// <, >, &, ", ' 를 escape 해서 렌더 깨짐·인젝션 방지.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

export async function sendCronFailureEmail({
  jobName,
  errorMessage,
  context,
}: SendCronFailureEmailParams) {
  // 시간 표기 (KST)
  const now = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const { data, error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: [ADMIN_EMAIL],
    subject: `[정책알리미 운영] cron 실패: ${jobName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 16px; font-weight: 800; color: #191f28;">정책알리미 · 운영 알림</span>
        </div>
        <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #f04452;">
          <div style="font-size: 13px; font-weight: 700; color: #f04452; margin-bottom: 6px;">CRON 실패</div>
          <div style="font-size: 18px; font-weight: 700; color: #191f28; margin-bottom: 6px;">${jobName}</div>
          <div style="font-size: 13px; color: #8b95a1;">${now} (KST)</div>
        </div>
        ${context ? `
          <div style="background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: #8b95a1; margin-bottom: 4px;">컨텍스트</div>
            <div style="font-size: 14px; color: #191f28;">${escapeHtml(context)}</div>
          </div>
        ` : ""}
        <div style="background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #8b95a1; margin-bottom: 4px;">에러 메시지</div>
          <div style="font-size: 13px; color: #191f28; font-family: monospace; word-break: break-all;">${escapeHtml(errorMessage)}</div>
        </div>
        <div style="font-size: 12px; color: #8b95a1; line-height: 1.7;">
          이 메일은 cron 실패 시 자동으로 발송됩니다.
          반복되면 Vercel Functions 로그를 확인하세요.
        </div>
      </div>
    `,
  });

  return { data, error };
}

// ============================================================
// 결제 영수증 메일
// ============================================================
// charge 라우트에서 자동결제 성공 시 호출됨.
// 토스가 발급한 receipt.url 이 있으면 "영수증 보기" 버튼으로 노출.
// ============================================================
type SendReceiptEmailParams = {
  to: string;
  tierName: string;        // "베이직" / "프로"
  amount: number;          // 결제 금액 (원)
  paidAt: string;          // ISO 시각 (토스 approvedAt)
  receiptUrl?: string;     // 토스 영수증 URL
  nextChargeAt: string;    // 다음 결제일 (ISO)
};

export async function sendReceiptEmail({
  to,
  tierName,
  amount,
  paidAt,
  receiptUrl,
  nextChargeAt,
}: SendReceiptEmailParams) {
  // 한국어 날짜 포맷 (예: "2026년 5월 22일")
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  const paidDate = fmt(paidAt);
  const nextDate = fmt(nextChargeAt);
  const amountStr = amount.toLocaleString();
  // 영수증 URL 은 토스가 보내지만, 만일을 대비해 https 만 허용 (javascript: 등 차단)
  const safeReceiptUrl = receiptUrl && receiptUrl.startsWith("https://") ? receiptUrl : null;

  const { data, error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject: `[정책알리미] ${tierName} 구독료 ${amountStr}원 결제 완료`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 800; color: #191f28;">정책알리미</span>
        </div>
        <div style="background: #f0f7ff; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 600; color: #3182f6; margin-bottom: 8px;">결제 완료</div>
          <div style="font-size: 22px; font-weight: 800; color: #191f28; margin-bottom: 6px;">${amountStr}원</div>
          <div style="font-size: 14px; color: #4e5968;">${tierName} 월 구독 · ${paidDate}</div>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;">
          <div style="font-size: 13px; color: #8b95a1; margin-bottom: 4px;">다음 결제일</div>
          <div style="font-size: 15px; font-weight: 600; color: #191f28;">${nextDate}</div>
        </div>
        ${safeReceiptUrl ? `
          <a href="${safeReceiptUrl}" style="display: inline-block; background: #3182f6; color: #ffffff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600;">
            영수증 보기
          </a>
        ` : ""}
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e8eb; font-size: 12px; color: #8b95a1; line-height: 1.7;">
          구독을 해지하시려면 <a href="https://정책알리미.kr/mypage/billing" style="color: #3182f6;">내 구독</a> 페이지에서 가능합니다.<br />
          이 메일은 결제 알림으로 자동 발송되었습니다.
        </div>
      </div>
    `,
  });

  return { data, error };
}
