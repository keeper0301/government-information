// ============================================================
// Phase 4-B rate limit — fixed window (1분), Supabase rate_limits 테이블.
// ============================================================
// 익명 사용자 분당 5회 / 로그인 사용자 분당 30회 제한 (default).
// 호출자가 bucket(고유 식별자) + limit 만 명시하면 됨.
// DB 실패 시 fail-open (allow) — 가용성 우선, 보안 차선.

import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

const WINDOW_SECONDS = 60;
export const ANON_LIMIT_PER_MINUTE = 5;
export const USER_LIMIT_PER_MINUTE = 30;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

export async function checkRateLimit({
  bucket,
  limit,
}: {
  bucket: string;
  limit: number;
}): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = Date.now();
  const windowMinute = Math.floor(now / 1000 / WINDOW_SECONDS);

  // RPC atomic increment — 078 의 increment_rate_limit 함수.
  const { data, error } = await admin.rpc("increment_rate_limit", {
    p_bucket: bucket,
    p_window_minute: windowMinute,
  });

  // DB 에러 시 fail-open. rate limit 가용성 > 정확성 (운영 안정성 우선).
  if (error) {
    console.warn("[rate-limit] increment 실패 — fail-open:", error.message);
    return { allowed: true, remaining: limit };
  }

  const count = typeof data === "number" ? data : 1;
  if (count > limit) {
    const elapsed = (now / 1000) % WINDOW_SECONDS;
    return { allowed: false, retryAfterSec: Math.ceil(WINDOW_SECONDS - elapsed) };
  }
  return { allowed: true, remaining: Math.max(0, limit - count) };
}

// IP 추출 — Vercel x-forwarded-for 첫 번째 값.
// 프록시 1단 만 있다고 가정. 다단계 프록시 시 실제 IP 가 첫 번째 X 일 수 있음.
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
