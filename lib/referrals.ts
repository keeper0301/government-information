// ============================================================
// lib/referrals.ts — Phase 5 A3 추천 시스템 비즈니스 로직
// ============================================================
// 흐름:
//   1) 마이페이지에서 사용자가 "내 코드 받기" 진입 → getOrCreateCode 호출
//      → pending 행 1개 발급 또는 재사용
//   2) 친구가 ?ref=CODE 로 진입 → 쿠키 저장
//   3) 친구 가입 callback → redeemReferral(code, newUserId) 호출
//      → 차단 케이스 검사 후 referrals.referred_id UPDATE + Pro 1주 연장
//
// 차단 케이스:
//   - 코드 not found / 이미 사용됨    → reason: 'invalid_code'
//   - 자기 자신 추천 (referrer == new) → reason: 'self_referral'
//   - 이미 redeem 한 사용자 (UNIQUE) → reason: 'already_redeemed'
//   - cap 10명 도달                  → reason: 'cap_reached'
//
// 보상 적용 (subscriptions 테이블):
//   - 행 없음     : tier='pro' status='trialing' current_period_end=now()+7d 신규
//   - 만료된 행   : current_period_end=now()+7d 로 갱신, status='trialing'
//   - 활성 행     : current_period_end += 7d (기간 누적 연장)
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// 추천 코드 발급 cap — 1명당 최대 10명 보상 받을 수 있음 (어뷰징 차단)
export const REFERRAL_REWARD_CAP = 10;

// 보상 1건당 Pro 연장 일수
export const REFERRAL_REWARD_DAYS = 7;

// base32 character set — 사용자 친화 (혼동되는 0/O, 1/I/L 제외)
// Crockford base32 변형: ABCDEFGHJKMNPQRSTVWXYZ + 23456789
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;

// redeemReferral 결과 타입
export type RedeemResult =
  | { ok: true; rewardAppliedAt: string }
  | {
      ok: false;
      reason:
        | "invalid_code"
        | "self_referral"
        | "already_redeemed"
        | "cap_reached"
        | "internal_error";
    };

// referrer 통계 (마이페이지 표시용)
export interface ReferralStats {
  pending: number; // 미사용 코드 (보통 1개)
  completed: number; // 보상 적용 완료
  rejected: number; // 차단된 시도 (자기추천·cap 등)
  total: number; // pending + completed + rejected
  capRemaining: number; // REFERRAL_REWARD_CAP - completed (음수 안 됨)
}

// ──────────────────────────────────────────────────────────
// 1) generateReferralCode — 6자리 무작위 base32 코드
// ──────────────────────────────────────────────────────────
// 충돌 가능성: 30^6 = 약 7.3억 → 실서비스 1만명 발급해도 충돌 ≈ 0
// 충돌 시 getOrCreateCode 가 unique 위반을 잡고 재시도하지 않음 (확률 무시).
export function generateReferralCode(): string {
  let result = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length);
    result += REFERRAL_CODE_ALPHABET[idx];
  }
  return result;
}

// ──────────────────────────────────────────────────────────
// 2) getOrCreateCode — referrer 의 미사용 코드 1개 보장
// ──────────────────────────────────────────────────────────
// 부분 unique index (referred_id IS NULL) 가 "1 referrer = 1 pending row" 보장.
// 이미 pending 행이 있으면 그 코드 그대로 반환, 없으면 신규 INSERT.
//
// 반환: 발급된 6자리 코드 (호출 측에서 https://www.keepioo.com/?ref=CODE 조립)
// ──────────────────────────────────────────────────────────
export async function getOrCreateCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>,
  referrerId: string,
): Promise<string> {
  // 1) 기존 미사용 행 조회
  const { data: existing } = await adminClient
    .from("referrals")
    .select("code")
    .eq("referrer_id", referrerId)
    .is("referred_id", null)
    .maybeSingle();

  if (existing?.code) return existing.code as string;

  // 2) 신규 발급 — generateReferralCode 충돌 시 unique 위반으로 INSERT 실패할 수 있음.
  //    부분 unique index 는 referrer_id 기준이라 같은 referrer 에서만 충돌.
  //    위 select 가 통과한 시점에는 pending 행이 없었으므로 사실상 충돌 0.
  const code = generateReferralCode();
  const { error } = await adminClient
    .from("referrals")
    .insert({
      referrer_id: referrerId,
      code,
      status: "pending",
    });

  if (error) {
    // 동시성으로 인한 unique 위반이면 다시 select 해서 기존 코드 반환
    const { data: retry } = await adminClient
      .from("referrals")
      .select("code")
      .eq("referrer_id", referrerId)
      .is("referred_id", null)
      .maybeSingle();
    if (retry?.code) return retry.code as string;
    throw error;
  }

  return code;
}

// ──────────────────────────────────────────────────────────
// 3) redeemReferral — 가입 callback 에서 호출
// ──────────────────────────────────────────────────────────
// 입력:
//   code       — 친구가 가져온 6자리 코드 (URL ?ref=CODE)
//   referredId — 방금 가입한 신규 사용자 id (auth.users.id)
//
// 부작용:
//   - referrals 행 UPDATE (referred_id, status, reward_applied_at)
//   - subscriptions 행 UPSERT (Pro 1주 연장)
//
// 실패해도 raise 하지 않음 — 가입 흐름 자체가 막히면 안 되므로 항상 결과 객체 반환.
// ──────────────────────────────────────────────────────────
export async function redeemReferral(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>,
  code: string,
  referredId: string,
): Promise<RedeemResult> {
  if (!code || code.length !== REFERRAL_CODE_LENGTH) {
    return { ok: false, reason: "invalid_code" };
  }

  try {
    // 1) 미사용 코드 lookup — pending + referred_id NULL 만 매칭
    const { data: row } = await adminClient
      .from("referrals")
      .select("id, referrer_id")
      .eq("code", code)
      .is("referred_id", null)
      .maybeSingle();

    if (!row) {
      return { ok: false, reason: "invalid_code" };
    }

    const referrerId = row.referrer_id as string;

    // 2) 자기 자신 추천 차단
    if (referrerId === referredId) {
      // 차단 자체를 감사 흔적으로 남기진 않음 (rejected 행 만들면 cap 카운트 왜곡)
      // 단순 fail 반환 — 가입은 정상 진행.
      return { ok: false, reason: "self_referral" };
    }

    // 3) 이미 redeem 한 사용자 차단 (UNIQUE 가 막지만 사전 체크로 명확한 사유 반환)
    const { data: alreadyRedeemed } = await adminClient
      .from("referrals")
      .select("id")
      .eq("referred_id", referredId)
      .maybeSingle();

    if (alreadyRedeemed) {
      return { ok: false, reason: "already_redeemed" };
    }

    // 4) referrer 의 completed 카운트 cap 검사
    const { count: completedCount } = await adminClient
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrerId)
      .eq("status", "completed");

    if ((completedCount ?? 0) >= REFERRAL_REWARD_CAP) {
      return { ok: false, reason: "cap_reached" };
    }

    // 5) 보상 적용 — Pro 1주 연장
    const rewardAppliedAt = await applyProReward(adminClient, referrerId);

    // 6) referrals 행 UPDATE — completed
    const { error: updateError } = await adminClient
      .from("referrals")
      .update({
        referred_id: referredId,
        status: "completed",
        reward_applied_at: rewardAppliedAt,
      })
      .eq("id", row.id);

    if (updateError) {
      console.error("[referrals] UPDATE 실패:", updateError.message);
      return { ok: false, reason: "internal_error" };
    }

    return { ok: true, rewardAppliedAt };
  } catch (err) {
    console.error("[referrals] redeem 예외:", err);
    return { ok: false, reason: "internal_error" };
  }
}

// ──────────────────────────────────────────────────────────
// 4) applyProReward — subscriptions 테이블 7일 연장
// ──────────────────────────────────────────────────────────
// 행 없음     → tier='pro' status='trialing' current_period_end=now()+7d 신규
// 만료된 행   → current_period_end=now()+7d, status='trialing'
// 활성 행     → current_period_end += 7d (이미 expires 가 미래면 거기에서 +7d)
//
// 누적 상한 가드 (수익 잠식 방지):
//   referral 가 cap 10명 도달하면 70일 Pro 즉시 부여 가능 → 결제 갱신 안 해도 영구 Pro 위험.
//   한 번에 최대 30일 까지만 누적 (now + 30d 가 천장). 초과 누적은 자연 만료 후 또 받기.
//
// 반환: 적용된 ISO timestamp (referrals.reward_applied_at 에 기록)
// ──────────────────────────────────────────────────────────

// 누적 상한 — 한 번에 최대 30일 까지만 Pro 연장 (referral 무한 누적 차단)
export const REFERRAL_REWARD_MAX_FUTURE_DAYS = 30;
async function applyProReward(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>,
  referrerId: string,
): Promise<string> {
  const now = new Date();
  const sevenDaysMs = REFERRAL_REWARD_DAYS * 24 * 60 * 60 * 1000;

  const { data: existing } = await adminClient
    .from("subscriptions")
    .select("id, tier, status, current_period_end")
    .eq("user_id", referrerId)
    .maybeSingle();

  const appliedAt = now.toISOString();

  if (!existing) {
    // 신규 — Pro 1주 trialing 으로 시작
    const periodEnd = new Date(now.getTime() + sevenDaysMs).toISOString();
    await adminClient.from("subscriptions").insert({
      user_id: referrerId,
      tier: "pro",
      status: "trialing",
      current_period_end: periodEnd,
    });
    return appliedAt;
  }

  // 기존 행 — current_period_end 기준 +7일.
  // null 또는 과거면 now + 7d, 미래면 그대로 + 7d 누적.
  const currentEnd = existing.current_period_end
    ? new Date(existing.current_period_end as string).getTime()
    : 0;
  const baseTime = currentEnd > now.getTime() ? currentEnd : now.getTime();
  // 누적 상한 — now + 30일 천장. 초과 누적은 자연 만료 후 또 받기 (수익 잠식 방지).
  const maxFutureMs = REFERRAL_REWARD_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
  const ceilingTime = now.getTime() + maxFutureMs;
  const newEnd = new Date(Math.min(baseTime + sevenDaysMs, ceilingTime)).toISOString();

  // tier 가 free 면 pro 로 승격, status 가 cancelled/free 면 trialing 으로 복구.
  // 이미 active/pro 인 경우 tier·status 는 그대로 유지.
  const updates: Record<string, unknown> = { current_period_end: newEnd };
  const tier = existing.tier as string | null;
  const status = existing.status as string | null;
  if (tier !== "pro") updates.tier = "pro";
  if (status === "free" || status === "cancelled" || status === "pending") {
    updates.status = "trialing";
  }

  await adminClient
    .from("subscriptions")
    .update(updates)
    .eq("id", existing.id);

  return appliedAt;
}

// ──────────────────────────────────────────────────────────
// 5) getReferralStats — 마이페이지 통계 카드용
// ──────────────────────────────────────────────────────────
// SSR client (사용자 본인) 또는 admin client 둘 다 받음. RLS 가
// referrer_id = auth.uid() 본인만 보여주므로 SSR client 도 안전.
// ──────────────────────────────────────────────────────────
export async function getReferralStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  userId: string,
): Promise<ReferralStats> {
  const { data } = await client
    .from("referrals")
    .select("status")
    .eq("referrer_id", userId);

  const rows = (data ?? []) as Array<{ status: string }>;
  const pending = rows.filter((r) => r.status === "pending").length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const total = rows.length;
  const capRemaining = Math.max(0, REFERRAL_REWARD_CAP - completed);

  return { pending, completed, rejected, total, capRemaining };
}
