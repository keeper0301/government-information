// ============================================================
// C3 — NPS 메일 link token (HMAC, anonymous 응답 허용).
// ============================================================
// CRON_SECRET 재사용 — 별도 env 추가 X. token=sha256(user_id+secret).slice(0,32).
// timing-safe 비교로 timing attack 방어.

import crypto from "node:crypto";

const TOKEN_LEN = 32;

export function generateNpsToken(userId: string): string {
  const secret = process.env.CRON_SECRET ?? "";
  return crypto
    .createHash("sha256")
    .update(`${userId}:${secret}:nps`)
    .digest("hex")
    .slice(0, TOKEN_LEN);
}

export function verifyNpsToken(userId: string, token: string): boolean {
  if (!token || token.length !== TOKEN_LEN) return false;
  const expected = generateNpsToken(userId);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
