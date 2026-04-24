// Supabase Auth 에러 메시지를 한국어 사용자 친화 문구로 변환
// Supabase는 에러 메시지가 영어로 나오는데, 일반 사용자에게 보여주면 혼란스러움
// 메시지에 특정 키워드가 있으면 번역하고, 없으면 일반 안내문으로 대체

type ErrorKey =
  | string // Supabase가 주는 원문 메시지 (부분 일치로 매칭)
  | "missing_code"
  | "access_denied";

// 키워드 기반 번역 맵 — 부분 문자열 일치로 탐색
const TRANSLATIONS: Array<{ match: RegExp; message: string }> = [
  // 로그인 자체 실패
  {
    match: /invalid login credentials/i,
    message: "이메일 또는 비밀번호가 올바르지 않아요.",
  },
  {
    match: /email not confirmed/i,
    message: "이메일 인증이 아직 완료되지 않았어요. 받은 편지함을 확인해주세요.",
  },
  {
    match: /user already registered|already been registered/i,
    message: "이미 가입된 이메일이에요. 로그인 페이지에서 로그인해주세요.",
  },

  // 비밀번호 관련
  {
    match: /password should be at least|weak password|password is too short/i,
    message: "비밀번호는 8자 이상으로 입력해주세요.",
  },
  {
    match: /passwords do not match|password mismatch/i,
    message: "비밀번호가 일치하지 않아요.",
  },
  {
    match: /new password should be different|same as the old/i,
    message: "새 비밀번호는 기존 비밀번호와 달라야 해요.",
  },
  {
    match: /signup.*disabled|signups not allowed/i,
    message: "현재 회원가입이 일시 중단되었어요. 잠시 후 다시 시도해주세요.",
  },

  // 속도 제한
  {
    match: /rate limit|too many requests|only request this once every/i,
    message: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.",
  },

  // OAuth 설정·동의 문제
  {
    match: /provider is not enabled|oauth provider not enabled/i,
    message: "이 로그인 방식이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.",
  },
  {
    match: /user email not available|missing email/i,
    message:
      "카카오 계정에서 이메일 제공에 동의해야 로그인할 수 있어요. 카카오 로그인 시 '이메일' 항목에 체크해주세요.",
  },
  {
    match: /redirect_uri_mismatch/i,
    message:
      "로그인 설정에 문제가 있어요. 관리자에게 문의해주세요. (redirect_uri_mismatch)",
  },
  {
    match: /access_denied/i,
    message: "로그인을 취소하셨어요.",
  },

  // 콜백 자체 문제
  {
    match: /missing_code/i,
    message: "로그인 정보가 누락되었어요. 다시 시도해주세요.",
  },
  {
    match: /code verifier|pkce/i,
    message: "로그인 세션이 만료되었어요. 처음부터 다시 시도해주세요.",
  },

  // 세션 관련
  {
    match: /token has expired|jwt expired/i,
    message: "세션이 만료되었어요. 다시 로그인해주세요.",
  },
  {
    match: /network|failed to fetch/i,
    message: "네트워크 연결에 문제가 있어요. 인터넷 상태를 확인해주세요.",
  },
];

// 에러 메시지를 한국어로 변환
// 매칭되는 게 없으면 원문을 괄호로 붙여서 대략적 안내문 반환
export function translateAuthError(raw: ErrorKey | null | undefined): string {
  if (!raw) return "알 수 없는 오류가 발생했어요.";
  const text = String(raw);
  for (const { match, message } of TRANSLATIONS) {
    if (match.test(text)) return message;
  }
  // 매칭 안 되는 경우: 사용자에게 일반 안내 + 개발자용 원문 포함
  return `로그인 중 문제가 발생했어요. (${text})`;
}

// ============================================================
// 에러 분류 — GA4 reason 파라미터용 enum 분류
// ============================================================
// translateAuthError 는 사용자 표시 문구, classifyAuthError 는 집계 분석용 카테고리.
// reason 값은 snake_case 고정 — GA4 Custom Dimension 히스토리 연속성 보장.
// 새 reason 추가 시 signup_failed / login_failed 이벤트 문서도 함께 업데이트.
// ============================================================

export type AuthErrorReason =
  | "email_exists"        // 이미 가입된 이메일 (회원가입 중복)
  | "weak_password"       // 비밀번호 8자 미만 또는 Supabase weak password 정책 위반
  | "password_mismatch"   // 비밀번호/확인 불일치 (signup 클라 검증)
  | "consent_required"    // 필수 동의(약관·방침) 미체크 (signup 클라 검증)
  | "invalid_credentials" // 로그인 시 이메일·비번 불일치
  | "email_not_confirmed" // 가입은 했으나 이메일 인증 미완료
  | "rate_limited"        // 메일 재발송 한도·로그인 시도 한도 초과
  | "network_error"       // 네트워크 단절·fetch 실패
  | "provider_disabled"   // OAuth provider 미활성
  | "oauth_cancelled"     // 사용자가 OAuth 동의 취소 (access_denied)
  | "missing_email"       // 카카오 OAuth 이메일 미동의 등
  | "unknown";            // 위 어느 것도 매칭 안 됨

export function classifyAuthError(
  raw: string | null | undefined,
): AuthErrorReason {
  if (!raw) return "unknown";
  const text = String(raw);
  // 순서 중요 — 더 구체적 패턴을 위에 (예: password_mismatch 가 weak_password 보다 먼저)
  if (/user already registered|already been registered/i.test(text)) return "email_exists";
  if (/passwords do not match|password mismatch/i.test(text)) return "password_mismatch";
  if (/password should be at least|weak password|password is too short/i.test(text)) return "weak_password";
  if (/invalid login credentials/i.test(text)) return "invalid_credentials";
  if (/email not confirmed/i.test(text)) return "email_not_confirmed";
  if (/rate limit|too many requests|only request this once/i.test(text)) return "rate_limited";
  if (/network|failed to fetch/i.test(text)) return "network_error";
  if (/provider is not enabled|oauth provider not enabled/i.test(text)) return "provider_disabled";
  if (/access_denied/i.test(text)) return "oauth_cancelled";
  if (/user email not available|missing email/i.test(text)) return "missing_email";
  return "unknown";
}
