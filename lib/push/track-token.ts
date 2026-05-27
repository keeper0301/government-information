// ============================================================
// PWA 푸시 클릭 추적 HMAC token (Spec 3 P1-1 review subagent fix 2026-05-27)
// ============================================================
// payload.data.logId 옆에 sign(logId) 동봉 → sw.js notificationclick 이
// track-click endpoint POST 시 logId+token 함께 전송 → endpoint 가 verify.
//
// 이로써 attacker 가 logId 1..N 임의 POST 로 모든 row 의 clicked_at 을
// marking 해서 push-time-learn 의 시간대 학습을 오염시키는 사고 차단.
//
// 보안:
//   - SECRET 우선순위 (5/27 P2 follow-up — secret 분리):
//       1. PUSH_TRACK_HMAC_SECRET (별도 env, 권장 — 노출 영향 격리)
//       2. CRON_SECRET (fallback, 호환)
//   - HMAC-SHA256 → hex slice(0,16) 8바이트. brute-force 비용 2^64 →
//     단일 logId guess 비용 천문학적. multi-logId 공격에도 안전.
//   - timing-safe compare 사용 (crypto.timingSafeEqual) — side-channel 방어.
//
// Vercel env 등록 (사장님 액션):
//   Settings → Environment Variables → Add:
//     Key: PUSH_TRACK_HMAC_SECRET
//     Value: openssl rand -base64 32 또는 PowerShell:
//       [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
//     Target: Production · Preview · Development 모두
//     Sensitive: ON
//   미등록 시 CRON_SECRET 자동 사용 (회귀 0). 등록 후 재배포 시점에 분리.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LEN = 16; // hex 16자 = 8 byte (≈64 bit security)

function getSecret(): string {
  // 1순위: 별도 env (권장). 미설정 시 CRON_SECRET fallback (회귀 호환).
  const dedicated = process.env.PUSH_TRACK_HMAC_SECRET;
  if (dedicated) return dedicated;
  const cron = process.env.CRON_SECRET;
  if (!cron) {
    throw new Error(
      "PUSH_TRACK_HMAC_SECRET or CRON_SECRET env missing — push track-token unavailable",
    );
  }
  return cron;
}

// logId 를 받아 hex token (16자) 반환.
export function signPushLogId(logId: number | bigint): string {
  const secret = getSecret();
  return createHmac("sha256", secret)
    .update(String(logId))
    .digest("hex")
    .slice(0, TOKEN_LEN);
}

// 검증 — 길이·timing-safe 비교. 다른 길이는 즉시 false.
export function verifyPushLogToken(
  logId: number | bigint,
  token: unknown,
): boolean {
  if (typeof token !== "string" || token.length !== TOKEN_LEN) return false;
  const expected = signPushLogId(logId);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
