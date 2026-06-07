import { timingSafeEqual } from "node:crypto";

// 인증 secret/토큰 비교용 상수시간 비교 (코드리뷰 P1, 2026-06-07).
// 단순 `!==` 는 첫 불일치 자릿수에서 early-return 해 응답시간 차이로 secret 을
// 자릿수별로 추론당할 수 있다(타이밍 공격). 길이 분기(secret 길이 자체는 비밀이
// 아님) + timingSafeEqual 로 상수시간을 보장한다.
// node:crypto 라 Edge runtime 미지원 — 사용 route 는 nodejs runtime 이어야 한다
// (CRON_SECRET·TELEGRAM_WEBHOOK_SECRET·IMPORT_PRESS_API_KEY 경로 모두 nodejs 확인됨).
export function safeKeyEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
