// ============================================================
// /admin 관리자 요약용 데이터 수집 헬퍼
// ============================================================
// 누적 KPI 4종 + 30일 시계열 (신규 가입·매출 추정) + 최근 결제 5건.
// 토스 라이브 결제 활성화 전이므로 매출은 활성 구독 × TIER_PRICES 추정.
// 실제 결제 amount 컬럼이 도입되면 (subscription_events 등) 그쪽 합산으로
// 교체 예정 — getDailyRevenueEstimated 내부 로직만 바꾸면 됨.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_PRICES, type Tier } from "@/lib/subscription";

// 활성 구독으로 인정할 status 목록 — /admin/page.tsx 의 24h 카드와 동일 기준
const ACTIVE_STATUSES = ["trialing", "active", "charging", "manual_grant"] as const;

// 누적 KPI 4종 — 캡쳐의 상단 카드 4개와 동일 의미
export type SummaryKpi = {
  totalUsers: number;          // auth.users 총합
  activeSubscriptions: number; // basic/pro 활성
  refundPending: number;       // 환불 대기 (시스템 미구현 → 항상 0)
  monthRevenueEstimated: number; // 이번 달 추정 매출 (활성 구독 tier × 가격)
};

export async function getSummaryKpi(): Promise<SummaryKpi> {
  const admin = createAdminClient();

  const [usersList, subsList] = await Promise.all([
    // auth.users 총 사용자 — listUsers 의 users.length 로 카운트.
    // 베타 단계 (수십~수백 명) 라 perPage=1000 한 번이면 전부 잡힘.
    // 1000명 초과로 늘면 page 루프 또는 별도 RPC 로 교체 필요.
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    // 활성 구독 row 의 tier 모두 조회 → 매출 추정 + 카운트 한 번에.
    admin
      .from("subscriptions")
      .select("tier")
      .in("status", [...ACTIVE_STATUSES])
      .in("tier", ["basic", "pro"]),
  ]);

  const totalUsers = usersList.data?.users.length ?? 0;
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
}

// 일별 시계열 데이터 — 30일치 KST 일자 기준
export type DailyPoint = { date: string; value: number };

// 지난 30일 신규 가입자 수 — auth.users.created_at KST 일자 그룹
// user_profiles 가 아닌 auth.users 기준 (온보딩 미완료 가입도 포함).
export async function getDailySignups(days = 30): Promise<DailyPoint[]> {
  const admin = createAdminClient();

  // 30일 전부터 오늘까지의 가입을 모두 조회 → JS 에서 KST 일자별 그룹.
  // listUsers 는 created_at desc 라 1000건 이내면 성능 문제 없음.
  // (4명 → 30일 후 수백 명 늘어도 1만 미만이라 안전)
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  const buckets = new Map<string, number>();
  // 빈 일자도 0으로 채워서 X축 누락 방지
  for (let i = 0; i < days; i++) {
    const ms = sinceMs + i * 24 * 60 * 60 * 1000;
    buckets.set(toKstDate(ms), 0);
  }

  for (const u of data?.users ?? []) {
    const ms = new Date(u.created_at).getTime();
    if (ms < sinceMs) continue;
    const key = toKstDate(ms);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
}

// 지난 30일 일별 매출 추정 — subscriptions.created_at 기준 신규 결제 발생일.
// 한 row = 한 결제 (월간 정기는 별도 row 가 아니라 같은 row 의 갱신이라 1회만 잡힘).
// 라이브 결제 활성화 후엔 subscription_events·payments 같은 결제 이벤트 row
// 를 합산하도록 교체 필요. 현재는 신규 가입 시점 매출을 보수적으로 표시.
export async function getDailyRevenueEstimated(days = 30): Promise<DailyPoint[]> {
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
}

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

export async function getRecentPayments(limit = 5): Promise<RecentPayment[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("subscriptions")
    .select("id, user_id, tier, status, customer_email, created_at")
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .in("tier", ["basic", "pro"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  // customer_email 이 NULL 인 경우 auth.users 에서 보강 (최근 5건이라 N+1 감수)
  const results: RecentPayment[] = [];
  for (const r of data as {
    id: string;
    user_id: string;
    tier: string;
    status: string;
    customer_email: string | null;
    created_at: string;
  }[]) {
    let email = r.customer_email;
    if (!email) {
      try {
        const { data: auth } = await admin.auth.admin.getUserById(r.user_id);
        email = auth?.user?.email ?? null;
      } catch {
        // 이미 삭제된 사용자
      }
    }
    results.push({
      id: r.id,
      userId: r.user_id,
      tier: r.tier,
      status: r.status,
      amount: TIER_PRICES[r.tier as Exclude<Tier, "free">] ?? 0,
      createdAt: r.created_at,
      email,
    });
  }
  return results;
}

// UTC ms 를 KST(UTC+9) 일자 문자열 (YYYY-MM-DD) 로 변환.
// Vercel 서버가 UTC 라 그냥 toISOString().slice(0,10) 하면 KST 자정 직후 9시간
// 동안 어제 일자로 잘못 분류됨. +9시간 보정 후 자르면 정확.
function toKstDate(utcMs: number): string {
  return new Date(utcMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
