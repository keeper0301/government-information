// ============================================================
// 카카오 알림톡 발송 클라이언트
// ============================================================
// keepioo 의 카카오 비즈채널을 통해 사용자에게 알림톡 발송.
//
// 발송 흐름 (실제):
//   1) 발송 대행사(Aligo, NHN Cloud Toast, Solapi 등) 결정
//   2) API 키를 KAKAO_ALIMTALK_API_KEY 환경변수에 저장
//   3) 발송 대행사 SDK 또는 REST 호출로 sendAlimtalkLive 채우기
//
// 현재 상태 (2026-04-24):
//   - 카카오 비즈 앱 전환 완료 ✓ (사업자등록 657-24-02265, 키피오)
//   - 발송 대행사 미정 → API 키 없음 → sendAlimtalk = "skipped" 반환
//   - dispatcher 쪽은 호출만 하고 결과를 그대로 alert_deliveries 에 기록
//
// 호출자 사용법 (alert-dispatch):
//   const result = await sendAlimtalk({
//     phoneNumber: '01012345678',
//     templateCode: 'POLICY_NEW',
//     variables: { title: '...', deadline: '...' },
//   });
//   if (result.ok) { ... } else { ... }
// ============================================================

export type AlimtalkPayload = {
  /** 수신자 휴대폰 번호 (하이픈 없는 11자리, 예: 01012345678) */
  phoneNumber: string;
  /** 카카오 비즈채널에 사전 승인된 템플릿 코드 */
  templateCode: string;
  /** 템플릿 변수 (예: #{이름}, #{정책명}) */
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
// 환경변수 KAKAO_ALIMTALK_PROVIDER 가 설정돼 있으면 sendAlimtalkLive 로 위임,
// 아니면 "skipped_no_provider" 즉시 반환.
//
// 이 분기 덕에 dev/staging/prod 환경 따로 카카오 발송 on/off 가능.
// CI 등 환경변수 없는 곳에서도 빌드 안 깨짐.
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

  // 2) 발송 대행사 미설정 → 즉시 skipped
  const provider = process.env.KAKAO_ALIMTALK_PROVIDER;
  if (!provider) {
    return { ok: false, reason: "skipped_no_provider" };
  }

  // 3) 실제 발송 대행사로 위임
  return sendAlimtalkLive({ ...payload, phoneNumber: phone }, provider);
}

// ============================================================
// 실제 발송 — 발송 대행사 결정 후 구현
// ============================================================
// 대행사별 분기:
//   - "aligo":   https://smartsms.aligo.in (REST, 가장 단순)
//   - "nhn":     NHN Cloud Toast Notification (https://www.nhncloud.com)
//   - "solapi":  Solapi (https://solapi.com, 한국 SaaS)
//   - "bizm":    Bizm (https://www.bizmsg.kr)
//
// 인터페이스만 동일하면 어느 쪽이든 교체 가능.
// ============================================================
async function sendAlimtalkLive(
  payload: AlimtalkPayload,
  provider: string,
): Promise<AlimtalkResult> {
  // 향후 구현. 현재는 placeholder.
  void payload;
  return {
    ok: false,
    reason: "api_error",
    error: `발송 대행사 '${provider}' 의 sendAlimtalkLive 구현 필요`,
  };
}
