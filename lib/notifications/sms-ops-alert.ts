// ============================================================
// 운영 alert SMS 발송 (사장님 휴대폰 즉시 알림)
// ============================================================
// 카카오 알림톡 신규 템플릿 (OPS_ALERT) 검수 시간 부담으로 SMS 우선 채택.
// 미래에 알림톡 친구톡(FT) 또는 OPS_ALERT 템플릿 등록 시 fallback 으로 강등.
//
// Solapi SMS API:
//   POST https://api.solapi.com/messages/v4/send
//   인증: HMAC-SHA256 (lib/kakao-alimtalk.ts 와 동일 패턴)
//   요금: 약 22~30원/건 (lms 90자 미만 → sms 단가)
//
// 사용처: app/api/cron/health-alert/route.ts
//   - 임계치 위반 시 sendOpsAlertEmail + sendOpsAlertSms 둘 다 발송
//   - SMS 가 즉시성 핵심 (사장님 카톡 푸시처럼 즉시 인지)
//
// 환경변수:
//   SOLAPI_API_KEY / SOLAPI_API_SECRET — 알림톡과 공유
//   SOLAPI_OPS_FROM_PHONE — Solapi 콘솔에 등록한 발신번호 (사업자 인증 필요)
//   SOLAPI_OPS_TO_PHONE   — 사장님 본인 휴대폰 (수신자, 010-xxxx-xxxx)
// ============================================================

import crypto from "node:crypto";

export type OpsAlertSmsResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "skipped_no_credentials"; error?: undefined }
  | { ok: false; reason: "skipped_disabled"; error?: undefined }
  | { ok: false; reason: "invalid_phone"; error: string }
  | { ok: false; reason: "api_error"; error: string }
  | { ok: false; reason: "network_error"; error: string };

const PHONE_RE = /^01[016789]\d{7,8}$/;

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!PHONE_RE.test(digits)) return null;
  return digits;
}

/**
 * 사장님 휴대폰으로 운영 alert SMS 즉시 발송.
 *
 * - 환경변수 누락 시 skipped (운영 미설정 단계 보호)
 * - SMS 90자 제한 — 90자 초과 시 LMS 로 자동 전환됨 (Solapi)
 * - 발송 실패 시 reason 별 분류 (network/api/invalid) — 호출자가 로그 가능
 *
 * @param subject  알림 제목 (예: "[keepioo 운영]")
 * @param message  본문 (alerts 메시지 join)
 */
export async function sendOpsAlertSms({
  subject,
  message,
  link,
}: {
  subject: string;
  message: string;
  /** SMS 본문 끝 링크 (사장님 즉시 처리 진입점). 미지정 시 admin/health 기본값. */
  link?: string;
}): Promise<OpsAlertSmsResult> {
  // 2026-05-21 사장님 명시 — Solapi 잔액 보존 위해 SMS 비활성화.
  // 텔레그램 채널이 사장님 즉시 알림 1차 (multichannel helper 가 텔레그램 + SMS 발송 → SMS skip).
  // 미래 재활성화 시 env 만 제거 (코드 변경 0).
  if (process.env.OPS_ALERT_DISABLE_SMS === "true") {
    return { ok: false, reason: "skipped_disabled" };
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const fromPhone = normalizePhone(process.env.SOLAPI_OPS_FROM_PHONE);
  const toPhone = normalizePhone(process.env.SOLAPI_OPS_TO_PHONE);

  if (!apiKey || !apiSecret || !fromPhone || !toPhone) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 본문 — 제목 + 메시지 (한 줄로 압축, SMS 가독성 우선)
  // 90자 초과 시 Solapi 가 자동으로 LMS 로 전환 (요금 약 30원)
  // link 가 빈 문자열이면 link line 자체 skip (사장님 진입 동기 없을 때 SMS 깔끔)
  const useLink = link !== undefined ? link : "keepioo.com/admin/health";
  const subjectLine = subject ? `${subject}\n` : "";
  const linkSuffix = useLink ? `\n\n→ ${useLink}` : "";
  const body = `${subjectLine}${message}${linkSuffix}`.slice(0, 1900);

  // HMAC-SHA256 — lib/kakao-alimtalk.ts 와 동일 규칙
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${date}${salt}`)
    .digest("hex");
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  let res: Response;
  try {
    res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          to: toPhone,
          from: fromPhone,
          text: body,
          // type 미지정 시 Solapi 가 길이 보고 자동 결정 (SMS/LMS)
        },
      }),
    });
  } catch (e) {
    const message = (e as Error).message;
    return { ok: false, reason: "network_error", error: message };
  }

  const json: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errCode = extractStringField(json, "errorCode") ?? `http_${res.status}`;
    const errMessage = extractStringField(json, "errorMessage") ?? "";
    return {
      ok: false,
      reason: "api_error",
      error: `${errCode}: ${errMessage}`.slice(0, 300),
    };
  }

  const messageId =
    extractStringField(json, "messageId") ??
    extractStringField(json, "groupId") ??
    "";
  return { ok: true, messageId };
}

function extractStringField(json: unknown, key: string): string | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
