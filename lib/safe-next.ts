// ============================================================
// next 파라미터 검증 헬퍼 (open redirect 방어)
// ============================================================
// 로그인·온보딩 완료 후 사용자를 redirect 시키는 `next` 쿼리 파라미터가
// 외부 URL 이면 피싱 공격 수단이 됨. 반드시 이 함수로 sanitize.
//
// 허용:
//   - `/` 또는 `/path` 같은 내부 절대 경로
// 차단:
//   - 빈 값 → `/`
//   - 외부 URL (`https://...`)
//   - 프로토콜 생략 URL (`//evil.com`)
//   - 역슬래시 우회 (`/\\evil.com` 을 `//evil.com` 으로 해석하는 브라우저 대응)
// ============================================================

export function safeNext(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
