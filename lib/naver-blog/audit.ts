// ============================================================
// 네이버 블로그 RPA — 발행 audit 로깅
// ============================================================
// 매 cron 실행마다 row 1개. 일일 cap, rate limit, 진단의 single source of truth.
// 인스타 attempt_count 사고 (admin client 통일 미흡) 교훈 — admin client 사용 + 결과 검증.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type AuditResult = "success" | "fail" | "skipped";

export type AuditSkipReason =
  | "outside_hours"
  | "daily_cap_reached"
  | "no_cookies"
  | "disabled"
  | "captcha_detected"
  | "2fa_detected"
  | "no_pending_queue"
  | "cookies_expired";

export type AuditInsert = {
  postId: string | null;
  result: AuditResult;
  errorMessage?: string | null;
  naverUrl?: string | null;
  skipReason?: AuditSkipReason | null;
  details?: Record<string, unknown> | null;
};

/**
 * audit row 1건 추가. cron 의 모든 시도 (success / fail / skipped) 가 호출.
 * 호출 실패해도 cron 자체는 계속 — 단지 logging.
 */
export async function logPublishAudit(input: AuditInsert): Promise<void> {
  const admin = createAdminClient();
  const kstHour = getKstHour();

  const { error } = await admin.from("naver_publish_audit").insert({
    post_id: input.postId,
    result: input.result,
    error_message: input.errorMessage ?? null,
    naver_url: input.naverUrl ?? null,
    skip_reason: input.skipReason ?? null,
    kst_hour: kstHour,
    details: input.details ?? null,
  });

  if (error) {
    // audit logging 실패는 cron 자체 영향 X — console.error 만
    console.error("[naver-publish-audit] insert 실패:", error.message);
  }
}

/**
 * 오늘 (KST 0시 ~ 현재) success 카운트.
 * 일일 cap (3~7건) 검사용. inserts vs counts — 인스타 사고 패턴 회피.
 */
export async function countTodaySuccess(): Promise<number> {
  const admin = createAdminClient();
  const kstMidnight = getKstMidnightUtc();

  const { count, error } = await admin
    .from("naver_publish_audit")
    .select("id", { count: "exact", head: true })
    .eq("result", "success")
    .gte("attempted_at", kstMidnight);

  if (error) {
    console.error("[naver-publish-audit] count 실패:", error.message);
    return 0; // 실패 시 0 반환 → 의도적으로 보수적 (skip 안 하고 진행)
  }
  return count ?? 0;
}

/**
 * 24h 동안의 발행/실패/skip 카운트 — /admin/health 카드용.
 */
export async function getAudit24hStats(): Promise<{
  success: number;
  fail: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [s, f, sk] = await Promise.all([
    admin
      .from("naver_publish_audit")
      .select("id", { count: "exact", head: true })
      .eq("result", "success")
      .gte("attempted_at", since),
    admin
      .from("naver_publish_audit")
      .select("id", { count: "exact", head: true })
      .eq("result", "fail")
      .gte("attempted_at", since),
    admin
      .from("naver_publish_audit")
      .select("id", { count: "exact", head: true })
      .eq("result", "skipped")
      .gte("attempted_at", since),
  ]);

  return {
    success: s.count ?? 0,
    fail: f.count ?? 0,
    skipped: sk.count ?? 0,
  };
}

// ────────────────────────────────────────────────────────────
// KST 시간 helpers
// ────────────────────────────────────────────────────────────
/**
 * 현재 KST 시 (0~23). cron 시간대 검증·audit 기록용.
 * KST = UTC + 9.
 */
export function getKstHour(): number {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).getUTCHours();
}

/**
 * 오늘 KST 0시 (UTC 표기 ISO 문자열). audit count 의 since 인자.
 * 오늘 KST 0:00 = 어제 UTC 15:00.
 */
export function getKstMidnightUtc(): string {
  const now = new Date();
  // 현재 KST 의 연·월·일 추출 (UTC + 9시 계산)
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST 0:00 = UTC 전날 15:00
  const utcMs = Date.UTC(y, m, d, -9, 0, 0);
  return new Date(utcMs).toISOString();
}
