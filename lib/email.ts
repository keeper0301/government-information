import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const { data, error } = await resend.emails.send({
    from: "정책알리미 <onboarding@resend.dev>",
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
