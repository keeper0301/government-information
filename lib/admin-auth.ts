// ============================================================
// 어드민 권한 체크 (이메일 기반)
// ============================================================
// keepioo는 운영자 1명 (사장님). 별도 admin_users 테이블 없이
// .env.local 의 ADMIN_EMAILS 환경변수에 이메일 콤마 구분으로 박아둠.
//
// 예: ADMIN_EMAILS=keeper0301@gmail.com
//
// 이메일 기반인 이유:
//   카카오·구글·이메일 로그인 등 OAuth provider 가 달라도
//   같은 이메일이면 같은 사람으로 간주. user_id 기반은 새 provider
//   추가 시마다 별도 user_id 가 발급돼 환경변수에 매번 추가해야 하는
//   문제가 있었음 (구글 로그인 시 admin 진입 못 하던 버그의 원인).
//
// 비교는 대소문자 무시 — 이메일은 RFC 상 case-insensitive.
// 이 함수가 false 면 호출자가 redirect 또는 403 처리해야 함.
// 권한 체크는 서버 사이드에서만 (클라이언트는 환경변수 못 봄).
// ============================================================

export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  if (!raw.trim()) return false;
  const target = email.trim().toLowerCase();
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(target);
}
