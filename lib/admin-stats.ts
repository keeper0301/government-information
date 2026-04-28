// ============================================================
// /admin 관리자 요약용 데이터 수집 헬퍼
// ============================================================
// 누적 KPI 4종 + 30일 시계열 (신규 가입·매출 추정) + 최근 결제 5건.
// 토스 라이브 결제 활성화 전이므로 매출은 활성 구독 × TIER_PRICES 추정.
// 실제 결제 amount 컬럼이 도입되면 (subscription_events 등) 그쪽 합산으로
// 교체 예정 — getDailyRevenueEstimated 내부 로직만 바꾸면 됨.
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_PRICES, type Tier } from "@/lib/subscription";

// 활성 구독으로 인정할 status 목록 — /admin/page.tsx 의 24h 카드와 동일 기준
const ACTIVE_STATUSES = ["trialing", "active", "charging", "manual_grant"] as const;

// auth.users listUsers 결과를 한 요청 안에서 공유 — getSummaryKpi · getDailySignups
// · getRecentSignups · getRecentPayments 모두 같은 결과 재사용 → 동일 round trip
// 4회 → 1회로 압축. perPage=1000 한 번이면 베타 단계 (수십~수백 명) 충분.
export const getAuthUsersCached = cache(async () => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users ?? [];
});

// id → email lookup map — N+1 (5 × getUserById) 제거용
export const getAuthUserEmailMap = cache(async () => {
  const users = await getAuthUsersCached();
  const map = new Map<string, string>();
  for (const u of users) {
    if (u.email) map.set(u.id, u.email);
  }
  return map;
});

// 누적 KPI 4종 — 캡쳐의 상단 카드 4개와 동일 의미
export type SummaryKpi = {
  totalUsers: number;          // auth.users 총합
  activeSubscriptions: number; // basic/pro 활성
  refundPending: number;       // 환불 대기 (시스템 미구현 → 항상 0)
  monthRevenueEstimated: number; // 이번 달 추정 매출 (활성 구독 tier × 가격)
};

export const getSummaryKpi = cache(async (): Promise<SummaryKpi> => {
  const admin = createAdminClient();

  const [users, subsList] = await Promise.all([
    // auth.users 총 사용자 — getAuthUsersCached 로 통합 (다른 함수와 round trip 공유).
    getAuthUsersCached(),
    // 활성 구독 row 의 tier 모두 조회 → 매출 추정 + 카운트 한 번에.
    admin
      .from("subscriptions")
      .select("tier")
      .in("status", [...ACTIVE_STATUSES])
      .in("tier", ["basic", "pro"]),
  ]);

  const totalUsers = users.length;
  const activeRows = (subsList.data ?? []) as { tier: string }[];
  const activeSubscriptions = activeRows.length;

  // 매출 추정: 활성 구독 × tier 가격. 한 사람이 매월 한 번 결제한다고 가정.
  // 라이브 결제 활성화 후엔 실제 결제 금액 합산으로 교체 필요.
  const monthRevenueEstimated = activeRows.reduce((sum, r) => {
    const price = TIER_PRICES[r.tier as Exclude<Tier, "free">] ?? 0;
    return sum + price;
  }, 0);

  return {
    totalUsers,
    activeSubscriptions,
    // 환불 시스템 미구현 — refunds 테이블·status='refund_pending' 도 없음.
    // 추후 환불 큐 추가 시 이 값을 실제 카운트로 교체.
    refundPending: 0,
    monthRevenueEstimated,
  };
});

// 일별 시계열 데이터 — 30일치 KST 일자 기준
export type DailyPoint = { date: string; value: number };

// 지난 30일 신규 가입자 수 — auth.users.created_at KST 일자 그룹
// user_profiles 가 아닌 auth.users 기준 (온보딩 미완료 가입도 포함).
// react cache + getAuthUsersCached 로 다른 함수와 listUsers 호출 공유.
export const getDailySignups = cache(async (days = 30): Promise<DailyPoint[]> => {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const users = await getAuthUsersCached();

  const buckets = new Map<string, number>();
  // 빈 일자도 0으로 채워서 X축 누락 방지
  for (let i = 0; i < days; i++) {
    const ms = sinceMs + i * 24 * 60 * 60 * 1000;
    buckets.set(toKstDate(ms), 0);
  }

  for (const u of users) {
    const ms = new Date(u.created_at).getTime();
    if (ms < sinceMs) continue;
    const key = toKstDate(ms);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
});

// 지난 30일 일별 매출 추정 — subscriptions.created_at 기준 신규 결제 발생일.
// 한 row = 한 결제 (월간 정기는 별도 row 가 아니라 같은 row 의 갱신이라 1회만 잡힘).
// 라이브 결제 활성화 후엔 subscription_events·payments 같은 결제 이벤트 row
// 를 합산하도록 교체 필요. 현재는 신규 가입 시점 매출을 보수적으로 표시.
export const getDailyRevenueEstimated = cache(async (days = 30): Promise<DailyPoint[]> => {
  const admin = createAdminClient();

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("subscriptions")
    .select("tier, status, created_at")
    .gte("created_at", sinceIso);

  const buckets = new Map<string, number>();
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  for (let i = 0; i < days; i++) {
    const ms = sinceMs + i * 24 * 60 * 60 * 1000;
    buckets.set(toKstDate(ms), 0);
  }

  for (const r of (data ?? []) as { tier: string; status: string; created_at: string }[]) {
    if (!ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number])) continue;
    const price = TIER_PRICES[r.tier as Exclude<Tier, "free">] ?? 0;
    if (price === 0) continue;
    const key = toKstDate(new Date(r.created_at).getTime());
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + price);
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
});

// 최근 결제 5건 — 활성 구독의 created_at 기준 최신.
// 진짜 "결제" 라기보다 "구독 생성" 시점이지만 라이브 결제 전엔 의미 동일.
export type RecentPayment = {
  id: string;
  userId: string;
  tier: string;
  status: string;
  amount: number;
  createdAt: string;
  email: string | null;
};

export const getRecentPayments = cache(async (limit = 5): Promise<RecentPayment[]> => {
  const admin = createAdminClient();

  // subscriptions + email map 병렬 조회. customer_email NULL 보강용 N+1 → map lookup.
  const [subsResult, emailMap] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, user_id, tier, status, customer_email, created_at")
      .in("status", [...ACTIVE_STATUSES])
      .in("tier", ["basic", "pro"])
      .order("created_at", { ascending: false })
      .limit(limit),
    getAuthUserEmailMap(),
  ]);

  const data = subsResult.data;
  if (!data || data.length === 0) return [];

  return (data as {
    id: string;
    user_id: string;
    tier: string;
    status: string;
    customer_email: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    tier: r.tier,
    status: r.status,
    amount: TIER_PRICES[r.tier as Exclude<Tier, "free">] ?? 0,
    createdAt: r.created_at,
    email: r.customer_email ?? emailMap.get(r.user_id) ?? null,
  }));
});

// UTC ms 를 KST(UTC+9) 일자 문자열 (YYYY-MM-DD) 로 변환.
// Vercel 서버가 UTC 라 그냥 toISOString().slice(0,10) 하면 KST 자정 직후 9시간
// 동안 어제 일자로 잘못 분류됨. +9시간 보정 후 자르면 정확.
function toKstDate(utcMs: number): string {
  return new Date(utcMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
