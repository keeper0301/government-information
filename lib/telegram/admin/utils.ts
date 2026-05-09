// ============================================================
// 텔레그램 어드민 명령 — 공통 유틸 (UUID 검증, SITE_BASE).
// ============================================================

export const SITE_BASE = "https://www.keepioo.com";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function uuidUsage(cmd: string): string {
  return `❌ candidate_uuid 형식 오류\n사용법: ${cmd} {uuid}`;
}
