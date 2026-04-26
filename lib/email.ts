import { Resend } from "resend";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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

// ============================================================
// 맞춤 정책 다이제스트 알림 (신규)
// ============================================================
// user_alert_rules 매칭 결과 — 새 정책 여러 건을 묶어 하루 1회 발송
// ============================================================
type CustomAlertProgram = {
  title: string;
  source: string;
  applyUrl: string | null;
  applyEnd: string | null;
  table: "welfare_programs" | "loan_programs";
  id: string;
};

type SendCustomAlertEmailParams = {
  to: string;
  ruleName: string;
  programs: CustomAlertProgram[];
};

export async function sendCustomAlertEmail({
  to,
  ruleName,
  programs,
}: SendCustomAlertEmailParams) {
  if (programs.length === 0) return { data: null, error: null };

  const safeRule = escapeHtml(ruleName);
  const rows = programs.map((p) => {
    const typeLabel = p.table === "welfare_programs" ? "복지" : "대출";
    const typePath = p.table === "welfare_programs" ? "welfare" : "loan";
    const safeTitle = escapeHtml(p.title);
    const safeSource = escapeHtml(p.source || "");
    const deadline = p.applyEnd ? `마감 ${p.applyEnd}` : "상시";
    const url = p.applyUrl && p.applyUrl.startsWith("http")
      ? p.applyUrl
      : `https://www.keepioo.com/${typePath}/${p.id}`;
    return `
      <div style="padding: 16px; border-bottom: 1px solid #e5e8eb;">
        <div style="font-size: 11px; font-weight: 700; color: #3182f6; margin-bottom: 4px;">${typeLabel} · ${safeSource}</div>
        <a href="${url}" style="font-size: 16px; font-weight: 700; color: #191f28; text-decoration: none;">${safeTitle}</a>
        <div style="font-size: 13px; color: #8b95a1; margin-top: 4px;">${deadline}</div>
      </div>
    `;
  }).join("");

  const { data, error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject: `[키피오] ${safeRule} · 새 맞춤 정책 ${programs.length}건`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 18px; font-weight: 800; color: #191f28;">keepioo 정책알리미</span>
        </div>
        <div style="background: #f0f7ff; border-radius: 16px; padding: 20px 24px; margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #3182f6; margin-bottom: 6px;">맞춤 알림 · ${safeRule}</div>
          <div style="font-size: 18px; font-weight: 700; color: #191f28;">오늘 새로 등록된 정책 ${programs.length}건</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e5e8eb; border-radius: 12px;">
          ${rows}
        </div>
        <div style="margin-top: 24px; font-size: 12px; color: #8b95a1; line-height: 1.7;">
          이 이메일은 <a href="https://www.keepioo.com/mypage/notifications" style="color: #3182f6;">맞춤 알림 설정</a> 에 의해 발송되었습니다.<br />
          알림 규칙을 조정하거나 해제할 수 있어요.
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

async function sendCronFailureEmail({
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
// dedupe 헬퍼 — 같은 (job, signature) 24시간 내 재발 시 메일 스킵
// ============================================================
// signature: 에러 메시지에서 변동값(타임스탬프·ID 등 숫자) 을 일반화
// 한 후 SHA1. 같은 외부 API 가 같은 이유로 죽어도 문구만 약간
// 다르면 다른 알림으로 가지 않게 함.
const NOTIFY_DEDUPE_HOURS = 24;

function makeFailureSignature(jobName: string, errorMessage: string): string {
  // jobName 도 변동 숫자(예: "실패율 5/8") 일반화 — 매번 다른 signature 폭주 방지.
  // 2026-04-26 사고: data.go.kr quota 초과 시 "5/7", "5/8", "5/9", "5/10" 등
  // batch total 따라 jobName 이 변동되어 24h dedupe 가 작동 안 한 회귀 hot-fix.
  const normalize = (s: string): string =>
    s.replace(/\d+/g, "N").replace(/\s+/g, " ").trim().substring(0, 200);
  return createHash("sha1")
    .update(`${normalize(jobName)}::${normalize(errorMessage)}`)
    .digest("hex");
}

// 공용 wrapper — cron 라우트의 catch 블록에서 호출.
// 메일 발송 실패가 cron 응답에 영향 주지 않도록 swallow.
// 24시간 내 같은 (job, signature) 가 이미 알림됐으면 메일 스킵 +
// occurrences 만 증가시켜 운영자 메일함이 폭주하지 않게 함.
export async function notifyCronFailure(
  jobName: string,
  errorMessage: string,
  context?: string,
) {
  try {
    const signature = makeFailureSignature(jobName, errorMessage);
    const supabase = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 기존 로그 조회 — signature 만으로 dedupe.
    // 이전엔 eq("job_name", jobName) 도 추가했지만, jobName 에 분모(5/5, 5/6,
    // 5/7, ...) 가 들어가면 매번 정확 매칭 실패 → 신규 row 생성 → 알림 폭주
    // 사고 (2026-04-26~04-27 ~100건 inbox 폭주). signature 는 normalize(jobName)
    // + normalize(errorMessage) 로 분모 N/N 으로 통일되니 signature 만으로 충분.
    //
    // limit(1) — 사고 이전에 jobName 별로 생성된 같은 signature row 가 여러 개
    // 있을 수 있어 maybeSingle() 은 PGRST116 (multiple rows) 에러 위험. 가장
    // 최근 row 1개만 가져와 update — 나머지는 cleanup SQL 로 정리하거나 자연 노화.
    const { data: existings } = await supabase
      .from("cron_failure_log")
      .select("id, notified_at, occurrences")
      .eq("signature", signature)
      .order("last_seen_at", { ascending: false })
      .limit(1);
    const existing = existings?.[0] ?? null;

    let shouldNotify: boolean;
    if (!existing) {
      // 신규 에러 → 메일 발송 + 새 로그
      shouldNotify = true;
      await supabase.from("cron_failure_log").insert({
        job_name: jobName,
        signature,
        error_message: errorMessage,
        context: context || null,
      });
    } else {
      const lastNotified = new Date(existing.notified_at as string);
      const hoursSince = (now.getTime() - lastNotified.getTime()) / 3_600_000;
      shouldNotify = hoursSince >= NOTIFY_DEDUPE_HOURS;

      // 기존 로그 갱신 (occurrences++ + last_seen_at, 알림 보낼 땐 notified_at 도)
      const updates: Record<string, unknown> = {
        last_seen_at: nowIso,
        occurrences: ((existing.occurrences as number) || 0) + 1,
      };
      if (shouldNotify) updates.notified_at = nowIso;
      await supabase
        .from("cron_failure_log")
        .update(updates)
        .eq("id", existing.id as number);
    }

    if (shouldNotify) {
      await sendCronFailureEmail({ jobName, errorMessage, context });
    }
  } catch {
    // dedupe·메일 발송 실패는 cron 응답에 영향 주지 않도록 swallow
  }
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
