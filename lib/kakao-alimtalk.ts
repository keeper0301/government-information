// ============================================================
// 카카오 알림톡 발송 클라이언트
// ============================================================
// keepioo 의 카카오 비즈채널(@keepioo) 을 통해 사용자에게 알림톡 발송.
//
// 발송 경로:
//   1) alert-dispatch cron 이 규칙 매칭 → sendAlimtalk() 호출
//   2) 이 모듈이 phoneNumber 검증 → provider 분기 → Solapi REST 호출
//   3) HMAC-SHA256 서명으로 인증 (Node 내장 crypto 만 사용, SDK 미설치)
//
// 환경변수 (Vercel):
//   KAKAO_ALIMTALK_PROVIDER=solapi           — 대행사 스위치
//   SOLAPI_API_KEY=NCS...                    — 솔라피 API Key
//   SOLAPI_API_SECRET=...                    — 솔라피 API Secret (HMAC 서명용)
//   KAKAO_CHANNEL_PFID=...                   — 카카오 채널 PFID (솔라피 콘솔에서 발급)
//   SOLAPI_TEMPLATE_ID_POLICY_NEW=...        — 심사 통과 후 발급되는 템플릿 고유 ID
//
// 환경변수 하나라도 빠지면 sendAlimtalk 가 skipped/api_error 반환 →
// alert_deliveries 에 기록되고 cron 은 실패로 보고하지 않음.
// ============================================================

import crypto from "node:crypto";
import { getSolapiTemplateId, type KakaoTemplateCode } from "@/lib/kakao-templates";

export type AlimtalkPayload = {
  /** 수신자 휴대폰 번호 (하이픈 허용, 내부에서 정규화) */
  phoneNumber: string;
  /** 카카오비즈니스 센터에 사전 승인된 템플릿 코드 */
  templateCode: KakaoTemplateCode;
  /** 템플릿 변수 (예: rule_name, title, deadline, detail_url) */
  variables: Record<string, string>;
};

export type AlimtalkResult =
  | { ok: true; messageId: string; provider: string }
  | { ok: false; reason: "skipped_no_provider"; error?: undefined }
  | { ok: false; reason: "invalid_phone"; error: string }
  | { ok: false; reason: "rate_limited"; error: string; retryAfterSec?: number }
  | { ok: false; reason: "blocked_by_user"; error: string }
  | { ok: false; reason: "template_rejected"; error: string }
  | { ok: false; reason: "api_error"; error: string };

// 한국 휴대폰 번호 검증 (010, 011, 016, 017, 018, 019)
const PHONE_RE = /^01[016789]\d{7,8}$/;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!PHONE_RE.test(digits)) return null;
  return digits;
}

// ============================================================
// 메인 진입점
// ============================================================
export async function sendAlimtalk(payload: AlimtalkPayload): Promise<AlimtalkResult> {
  // 1) 휴대폰 번호 정규화 + 검증
  const phone = normalizePhone(payload.phoneNumber);
  if (!phone) {
    return {
      ok: false,
      reason: "invalid_phone",
      error: `올바르지 않은 휴대폰 번호 형식: ${payload.phoneNumber}`,
    };
  }

  // 2) 발송 대행사 미설정 → 즉시 skipped (CI·dev 환경에서 빌드 안 깨짐)
  const provider = process.env.KAKAO_ALIMTALK_PROVIDER;
  if (!provider) {
    return { ok: false, reason: "skipped_no_provider" };
  }

  // 3) 실제 발송 대행사로 위임
  return sendAlimtalkLive({ ...payload, phoneNumber: phone }, provider);
}

// ============================================================
// 대행사별 분기 — 현재 Solapi 만 구현
// ============================================================
async function sendAlimtalkLive(
  payload: AlimtalkPayload,
  provider: string,
): Promise<AlimtalkResult> {
  if (provider === "solapi") {
    return sendViaSolapi(payload);
  }
  return {
    ok: false,
    reason: "api_error",
    error: `미지원 발송 대행사: ${provider} (현재 solapi 만 지원)`,
  };
}

// ============================================================
// Solapi REST 발송
// ============================================================
// Docs: https://docs.solapi.com
// Auth: HMAC-SHA256 서명 헤더 (SDK 없이 Node crypto 로 구현)
// Endpoint: POST https://api.solapi.com/messages/v4/send
// ============================================================
async function sendViaSolapi(payload: AlimtalkPayload): Promise<AlimtalkResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.KAKAO_CHANNEL_PFID;
  const templateId = getSolapiTemplateId(payload.templateCode);

  // 필수 환경변수 누락 체크 — 어떤 값이 빠졌는지 구체적으로 알려줌 (운영 디버깅)
  const missing: string[] = [];
  if (!apiKey) missing.push("SOLAPI_API_KEY");
  if (!apiSecret) missing.push("SOLAPI_API_SECRET");
  if (!pfId) missing.push("KAKAO_CHANNEL_PFID");
  if (!templateId) missing.push(`SOLAPI_TEMPLATE_ID_${payload.templateCode}`);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "api_error",
      error: `솔라피 환경변수 누락: ${missing.join(", ")}`,
    };
  }

  // HMAC-SHA256 서명
  // 서명 규칙: HMAC(apiSecret, `${date}${salt}`)
  // Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret!)
    .update(`${date}${salt}`)
    .digest("hex");
  const authorization =
    `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  // Solapi 는 템플릿 변수를 `#{키}` 형태 키로 받음
  const solapiVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.variables)) {
    solapiVars[`#{${key}}`] = value;
  }

  const body = {
    message: {
      to: payload.phoneNumber,
      kakaoOptions: {
        pfId,
        templateId,
        variables: solapiVars,
        // 알림톡 실패 시 SMS 대체 발송 기본 비활성화 — 발신번호 별도 등록 비용 발생 방지.
        // 향후 필요하면 env FLAG 도입해 토글.
        disableSms: true,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "api_error", error: `솔라피 네트워크 오류: ${msg}` };
  }

  const json: unknown = await res.json().catch(() => ({}));
  const errorCode = extractStringField(json, "errorCode");
  const errorMessage = extractStringField(json, "errorMessage") ?? "";

  if (res.ok) {
    // 성공 응답 — messageId 또는 groupId 어느 쪽이든 추적용 ID 로 사용
    const messageId =
      extractStringField(json, "messageId") ??
      extractStringField(json, "groupId") ??
      "";
    return { ok: true, messageId, provider: "solapi" };
  }

  // 실패 응답 — 에러 코드별 reason 분류
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    return {
      ok: false,
      reason: "rate_limited",
      error: `${errorCode ?? "429"}: ${errorMessage}`,
      retryAfterSec: retryAfter ? Number(retryAfter) : undefined,
    };
  }
  // Solapi 에러코드 참고 (대표적인 것만 분류, 나머지는 api_error 로 묶음):
  //  - BlockedNumber / UnavailableReceiver: 사용자가 차단 or 수신 불가
  //  - InvalidTemplate / TemplateNotApproved: 템플릿 미승인·변수 불일치
  if (errorCode === "BlockedNumber" || errorCode === "UnavailableReceiver") {
    return {
      ok: false,
      reason: "blocked_by_user",
      error: `${errorCode}: ${errorMessage}`,
    };
  }
  if (
    errorCode === "InvalidTemplate" ||
    errorCode === "TemplateNotApproved" ||
    errorCode === "TemplateNotFound"
  ) {
    return {
      ok: false,
      reason: "template_rejected",
      error: `${errorCode}: ${errorMessage}`,
    };
  }
  return {
    ok: false,
    reason: "api_error",
    error: `${errorCode ?? `http_${res.status}`}: ${errorMessage}`.slice(0, 500),
  };
}

// Solapi 응답 JSON 에서 문자열 필드 안전 추출 (타입 좁히기 + null/undefined 방어)
function extractStringField(json: unknown, key: string): string | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
