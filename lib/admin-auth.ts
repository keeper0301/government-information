// ============================================================
// 어드민 권한 체크
// ============================================================
// keepioo는 운영자 1명 (사장님). 별도 admin_users 테이블 없이
// .env.local 의 ADMIN_USER_IDS 환경변수에 user_id 콤마 구분으로 박아둠.
//
// 예: ADMIN_USER_IDS=7e25d1c8-5ed5-4c54-bb1f-db2919a29cbd,abcd-...
//
// 이 함수가 false 면 호출자가 redirect 또는 403 처리해야 함.
// 권한 체크는 서버 사이드에서만 (클라이언트는 환경변수 못 봄).
// ============================================================

export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS ?? "";
  if (!raw.trim()) return false;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(userId);
}
