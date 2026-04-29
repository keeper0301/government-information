// ============================================================
// __tests__/lib/referrals.test.ts — Phase 5 A3 referral 단위 테스트
// ============================================================
// supabase chain 을 stub. 8 case:
//   1. generateReferralCode 길이·character set
//   2. getOrCreateCode 신규 발급
//   3. getOrCreateCode 기존 pending 재사용
//   4. redeemReferral 자기 자신 추천 차단
//   5. redeemReferral 이미 redeem 한 사용자 차단
//   6. redeemReferral cap 10명 도달 차단
//   7. redeemReferral 신규 subscription 생성 (행 없음 → +7일)
//   8. redeemReferral 기존 expires_at += 7일 누적
//   9. getReferralStats pending/completed/total 카운트
// ============================================================

import { describe, it, expect } from "vitest";
import {
  generateReferralCode,
  getOrCreateCode,
  redeemReferral,
  getReferralStats,
  REFERRAL_CODE_LENGTH,
  REFERRAL_REWARD_CAP,
  REFERRAL_REWARD_DAYS,
} from "@/lib/referrals";

// ──────────────────────────────────────────────────────────
// supabase chain stub — 테이블별로 행위를 정의
// ──────────────────────────────────────────────────────────
// fixtures:
//   referrals_select_pending : .select().eq(referrer_id).is(referred_id null).maybeSingle 결과
//   referrals_select_by_code : .select().eq(code).is(referred_id null).maybeSingle 결과
//   referrals_select_by_referred : .select().eq(referred_id).maybeSingle 결과
//   referrals_count_completed: .select(count).eq(referrer_id).eq(completed) 결과
//   referrals_select_all_for_stats : .select(status).eq(referrer_id) 결과
//   subscriptions_select : .select().eq(user_id).maybeSingle 결과
//
// stub 은 chain 호출을 기록만 하고, 마지막 await 시점에 가장 매칭되는 fixture 반환.
// ──────────────────────────────────────────────────────────

interface StubOptions {
  // referrals 테이블 query 응답
  referralsPending?: { code: string } | null;
  referralsByCode?: { id: string; referrer_id: string } | null;
  referralsByReferred?: { id: string } | null;
  referralsCompletedCount?: number;
  referralsAllStats?: Array<{ status: string }>;
  // subscriptions 테이블 query 응답
  subscriptionExisting?: {
    id: string;
    tier: string | null;
    status: string | null;
    current_period_end: string | null;
  } | null;
  // 기록용 — UPDATE/INSERT 호출 추적
  capture?: {
    referralsInsert?: Record<string, unknown>;
    referralsUpdate?: Record<string, unknown>;
    subscriptionsInsert?: Record<string, unknown>;
    subscriptionsUpdate?: Record<string, unknown>;
  };
}

function makeStub(opts: StubOptions) {
  const cap = opts.capture ?? {};

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function fromReferrals(): any {
    let isCount = false;
    let queryKind: "pending" | "by_code" | "by_referred" | "stats" | "unknown" =
      "unknown";

    const builder: any = {
      select(_cols?: string, options?: { count?: string; head?: boolean }) {
        if (options?.count === "exact" && options.head) {
          isCount = true;
        }
        return builder;
      },
      eq(col: string, _val: unknown) {
        if (col === "referrer_id" && !isCount && queryKind === "unknown") {
          queryKind = "pending"; // 가능성 1 (다음 .is 가 referred_id 면 확정)
        } else if (col === "code") {
          queryKind = "by_code";
        } else if (col === "referred_id") {
          queryKind = "by_referred";
        } else if (col === "referrer_id" && !isCount && queryKind === "pending") {
          // stats query: select('status').eq('referrer_id') (no .is, no .maybeSingle)
          queryKind = "stats";
        }
        return builder;
      },
      is(col: string, _val: unknown) {
        if (col === "referred_id") {
          // by_code 와 pending 둘 다 .is('referred_id', null) 사용
          // queryKind 가 by_code 면 그대로 두고, pending 이면 그대로 둠.
        }
        return builder;
      },
      maybeSingle() {
        if (queryKind === "pending") {
          return Promise.resolve({
            data: opts.referralsPending ?? null,
            error: null,
          });
        }
        if (queryKind === "by_code") {
          return Promise.resolve({
            data: opts.referralsByCode ?? null,
            error: null,
          });
        }
        if (queryKind === "by_referred") {
          return Promise.resolve({
            data: opts.referralsByReferred ?? null,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      // stats query: select('status').eq('referrer_id', ...) — await 직접
      then(onFulfilled: any, onRejected?: any) {
        if (isCount) {
          return Promise.resolve({
            count: opts.referralsCompletedCount ?? 0,
            error: null,
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({
          data: opts.referralsAllStats ?? [],
          error: null,
        }).then(onFulfilled, onRejected);
      },
      insert(payload: Record<string, unknown>) {
        cap.referralsInsert = payload;
        return Promise.resolve({ error: null });
      },
      update(payload: Record<string, unknown>) {
        cap.referralsUpdate = payload;
        return {
          eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
        };
      },
    };
    return builder;
  }

  function fromSubscriptions(): any {
    const builder: any = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({
          data: opts.subscriptionExisting ?? null,
          error: null,
        });
      },
      insert(payload: Record<string, unknown>) {
        cap.subscriptionsInsert = payload;
        return Promise.resolve({ error: null });
      },
      update(payload: Record<string, unknown>) {
        cap.subscriptionsUpdate = payload;
        return {
          eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
        };
      },
    };
    return builder;
  }

  return {
    from(table: string): any {
      if (table === "referrals") return fromReferrals();
      if (table === "subscriptions") return fromSubscriptions();
      throw new Error(`unexpected table: ${table}`);
    },
  } as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ──────────────────────────────────────────────────────────
// 1) generateReferralCode
// ──────────────────────────────────────────────────────────
describe("generateReferralCode", () => {
  it("길이 6 + 허용된 base32 character set", () => {
    const allowed = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]+$/;
    for (let i = 0; i < 50; i += 1) {
      const code = generateReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      expect(allowed.test(code)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────
// 2~3) getOrCreateCode
// ──────────────────────────────────────────────────────────
describe("getOrCreateCode", () => {
  it("기존 pending 코드가 있으면 그대로 반환 (재사용)", async () => {
    const capture: StubOptions["capture"] = {};
    const supabase = makeStub({
      referralsPending: { code: "ABC234" },
      capture,
    });
    const code = await getOrCreateCode(supabase, "user-1");
    expect(code).toBe("ABC234");
    expect(capture.referralsInsert).toBeUndefined();
  });

  it("미사용 코드 없으면 신규 INSERT 후 코드 반환", async () => {
    const capture: StubOptions["capture"] = {};
    const supabase = makeStub({
      referralsPending: null,
      capture,
    });
    const code = await getOrCreateCode(supabase, "user-2");
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(capture.referralsInsert).toBeDefined();
    expect(capture.referralsInsert?.referrer_id).toBe("user-2");
    expect(capture.referralsInsert?.status).toBe("pending");
  });
});

// ──────────────────────────────────────────────────────────
// 4~6) redeemReferral 차단 케이스
// ──────────────────────────────────────────────────────────
describe("redeemReferral 차단 케이스", () => {
  it("자기 자신 추천 차단 (self_referral)", async () => {
    const supabase = makeStub({
      referralsByCode: { id: "r1", referrer_id: "user-A" },
    });
    const result = await redeemReferral(supabase, "ABC234", "user-A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("self_referral");
  });

  it("이미 redeem 한 사용자 차단 (already_redeemed)", async () => {
    const supabase = makeStub({
      referralsByCode: { id: "r1", referrer_id: "user-A" },
      referralsByReferred: { id: "r-prev" }, // 이미 다른 코드 redeem 한 적 있음
    });
    const result = await redeemReferral(supabase, "ABC234", "user-B");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_redeemed");
  });

  it("cap 10명 도달 시 차단 (cap_reached)", async () => {
    const supabase = makeStub({
      referralsByCode: { id: "r1", referrer_id: "user-A" },
      referralsByReferred: null,
      referralsCompletedCount: REFERRAL_REWARD_CAP,
    });
    const result = await redeemReferral(supabase, "ABC234", "user-B");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cap_reached");
  });

  it("코드 not found 차단 (invalid_code)", async () => {
    const supabase = makeStub({
      referralsByCode: null,
    });
    const result = await redeemReferral(supabase, "XXXXXX", "user-B");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_code");
  });
});

// ──────────────────────────────────────────────────────────
// 7~8) redeemReferral 보상 적용
// ──────────────────────────────────────────────────────────
describe("redeemReferral 보상 (Pro 1주 연장)", () => {
  it("subscriptions 행 없음 → 신규 생성 (now + 7일)", async () => {
    const capture: StubOptions["capture"] = {};
    const supabase = makeStub({
      referralsByCode: { id: "r1", referrer_id: "user-A" },
      referralsByReferred: null,
      referralsCompletedCount: 0,
      subscriptionExisting: null,
      capture,
    });
    const before = Date.now();
    const result = await redeemReferral(supabase, "ABC234", "user-B");
    expect(result.ok).toBe(true);
    expect(capture.subscriptionsInsert).toBeDefined();
    expect(capture.subscriptionsInsert?.tier).toBe("pro");
    expect(capture.subscriptionsInsert?.status).toBe("trialing");
    // current_period_end 는 약 now + 7일
    const periodEnd = new Date(
      capture.subscriptionsInsert?.current_period_end as string,
    ).getTime();
    const expected = before + REFERRAL_REWARD_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(periodEnd - expected)).toBeLessThan(5_000); // 5초 오차 허용
    // referrals 행 UPDATE 도 일어남 — completed 로
    expect(capture.referralsUpdate?.status).toBe("completed");
    expect(capture.referralsUpdate?.referred_id).toBe("user-B");
  });

  it("기존 subscriptions current_period_end 미래 → 7일 누적 연장", async () => {
    const capture: StubOptions["capture"] = {};
    // 30일 뒤 만료 예정인 active pro 구독자
    const futureEnd = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = makeStub({
      referralsByCode: { id: "r1", referrer_id: "user-A" },
      referralsByReferred: null,
      referralsCompletedCount: 3,
      subscriptionExisting: {
        id: "sub-1",
        tier: "pro",
        status: "active",
        current_period_end: futureEnd,
      },
      capture,
    });
    const result = await redeemReferral(supabase, "ABC234", "user-B");
    expect(result.ok).toBe(true);
    expect(capture.subscriptionsUpdate).toBeDefined();
    // current_period_end 가 기존 + 7일로 갱신
    const newEnd = new Date(
      capture.subscriptionsUpdate?.current_period_end as string,
    ).getTime();
    const expected =
      new Date(futureEnd).getTime() + REFERRAL_REWARD_DAYS * 24 * 60 * 60 * 1000;
    expect(newEnd).toBe(expected);
    // tier·status 는 이미 pro/active 라 변경 없음 (updates 객체에 없음)
    expect(capture.subscriptionsUpdate?.tier).toBeUndefined();
    expect(capture.subscriptionsUpdate?.status).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────
// 9) getReferralStats
// ──────────────────────────────────────────────────────────
describe("getReferralStats", () => {
  it("pending/completed/rejected/total 카운트 + capRemaining 계산", async () => {
    const supabase = makeStub({
      referralsAllStats: [
        { status: "pending" },
        { status: "completed" },
        { status: "completed" },
        { status: "completed" },
        { status: "rejected" },
      ],
    });
    const stats = await getReferralStats(supabase, "user-A");
    expect(stats.pending).toBe(1);
    expect(stats.completed).toBe(3);
    expect(stats.rejected).toBe(1);
    expect(stats.total).toBe(5);
    expect(stats.capRemaining).toBe(REFERRAL_REWARD_CAP - 3);
  });

  it("빈 결과 → 모두 0, capRemaining = REFERRAL_REWARD_CAP", async () => {
    const supabase = makeStub({ referralsAllStats: [] });
    const stats = await getReferralStats(supabase, "user-A");
    expect(stats.pending).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.capRemaining).toBe(REFERRAL_REWARD_CAP);
  });
});
