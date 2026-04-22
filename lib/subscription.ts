// ============================================================
// 구독 권한 체크 헬퍼
// ============================================================
// 사용자가 어떤 티어인지 조회하고, 특정 기능에 권한이 있는지 검사.
// API 라우트에서 한 줄로 권한 가드 가능: requireTier(userId, 'basic')
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

// 티어 종류
export type Tier = "free" | "basic" | "pro";

// 티어별 가격 (월 단위, 원)
// 토스 결제 시 amount 로 사용
export const TIER_PRICES: Record<Exclude<Tier, "free">, number> = {
  basic: 4900,
  pro: 9900,
};

// 티어별 한국어 이름 (UI 표시용)
export const TIER_NAMES: Record<Tier, string> = {
  free: "무료",
  basic: "베이직",
  pro: "프로",
};

// 티어 우열 — 숫자가 높을수록 상위 티어
// requireTier 비교 시 사용
const TIER_RANK: Record<Tier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
};

// 티어별 기능 권한
// 새 기능 추가 시 여기에 한 줄만 추가하면 됨
export const TIER_FEATURES: Record<Tier, {
  // 정책 추천 (모두 가능)
  recommend: boolean;
  // 마감 7일 전 이메일 알림 등록
  email_alarm: boolean;
  // SMS 알림 (프로만)
  sms: boolean;
  // AI 상담 무제한 (프로만, 무료/베이직은 일일 제한)
  ai_unlimited: boolean;
}> = {
  free:  { recommend: true, email_alarm: false, sms: false, ai_unlimited: false },
  basic: { recommend: true, email_alarm: true,  sms: false, ai_unlimited: false },
  pro:   { recommend: true, email_alarm: true,  sms: true,  ai_unlimited: true  },
};

// ============================================================
// 사용자의 현재 티어 조회
// ============================================================
// 구독 행이 없거나 cancelled + period 만료 시 'free' 반환
// trialing 도 'basic'/'pro' 로 인정 (체험 중에는 기능 사용 가능)
// past_due 는 결제 실패 직후 — 일단 기능 차단하지 않고 grace period 유지
// ============================================================
export async function getUserTier(userId: string): Promise<Tier> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("tier, status, current_period_end, trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  // 구독 정보 없음 → 무료
  if (!data) return "free";

  // pending: 카드 등록 전이라 사실상 무료 사용자 (결제 의도만 있음)
  if (data.status === "pending") return "free";

  // 해지됐고 + 결제 주기도 끝났으면 무료로 다운그레이드
  if (data.status === "cancelled") {
    const now = Date.now();
    const periodEnd = data.current_period_end ? new Date(data.current_period_end).getTime() : 0;
    if (periodEnd < now) return "free";
  }

  // 그 외 (active, trialing, charging, past_due, cancelled-아직-기간내) 는 저장된 티어 그대로
  return (data.tier as Tier) || "free";
}

// ============================================================
// 권한 가드 — 호출자가 minTier 이상이어야 통과
// ============================================================
// 사용 예:
//   const userTier = await requireTier(user.id, 'basic');
//   if (!userTier) return NextResponse.json({...}, { status: 403 });
//
// 통과 시 사용자의 실제 티어 반환 (basic 가드 통과 시 pro 도 받을 수 있음)
// 미달 시 null 반환 (호출자가 NextResponse 로 변환)
// ============================================================
export async function requireTier(userId: string, minTier: Tier): Promise<Tier | null> {
  const userTier = await getUserTier(userId);
  if (TIER_RANK[userTier] >= TIER_RANK[minTier]) {
    return userTier;
  }
  return null;
}

// 티어 비교 헬퍼 (DB 조회 없이 단순 비교)
export function hasMinTier(userTier: Tier, minTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[minTier];
}
