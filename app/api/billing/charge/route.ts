// ============================================================
// /api/billing/charge — 자동결제 실행
// ============================================================
// 두 가지 모드:
//   1) 특정 사용자 1건 결제 (POST body: { userId })
//   2) batch: 결제일 도래한 모든 사용자 일괄 (POST body 비움)
//
// 인증: Authorization: Bearer ${CRON_SECRET}
//        - Vercel Cron 또는 Supabase pg_cron 에서 호출
//        - 외부 노출 금지
//
// 동시성 보호 (race condition 방지):
//   결제 시작 시 status 를 'charging' 으로 atomic UPDATE → 영향행수 == 1 인 사용자만 진행.
//   동일 사용자에 대해 동시에 두 번 호출돼도, 한 호출만 통과하고 다른 호출은 skip.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeBilling, generateOrderId, TossError } from "@/lib/toss";
import { TIER_PRICES, TIER_NAMES, SUBSCRIPTION_PERIOD_MS, type Tier } from "@/lib/subscription";
import { sendReceiptEmail } from "@/lib/email";
import { authorizePrivateCronRequest } from "@/lib/cron-auth";

// 30일을 ms 로 (공용 상수 — charge·webhook 공유)
const PERIOD_MS = SUBSCRIPTION_PERIOD_MS;

// 결제 시도 가능한 상태 (동시성 락 풀기 위한 화이트리스트)
const CHARGEABLE_STATUSES = ["trialing", "active", "past_due"] as const;

export async function POST(request: NextRequest) {
  // 1) 인증: CRON_SECRET 검증
  const denied = authorizePrivateCronRequest(request);
  if (denied) return denied;

  // 2) body 파싱 (없으면 batch 모드)
  let userId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    userId = body.userId;
  } catch {
    // body 없음 → batch
  }

  const admin = createAdminClient();

  // 3) 결제 대상 user_id 목록 조회
  // 단건: 해당 userId 1개
  // batch: trialing/active 중에서 current_period_end 가 지난 사용자들
  let candidateIds: string[] = [];

  if (userId) {
    candidateIds = [userId];
  } else {
    const now = new Date().toISOString();
    // 좀비 charging 락 복구 — 이전 실행이 status=charging 설정 후 크래시(timeout/OOM)하면
    // charging 에 영구히 머물러 다음 cron 청구 대상(trialing/active)에서 빠져 무료 방치된다.
    // 10분+ 지속된 charging 은 좀비로 보고 past_due 로 복구한다 (코드리뷰 P2).
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("status", "charging")
      .lt("updated_at", tenMinAgo);

    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .in("status", ["trialing", "active"])
      .lte("current_period_end", now);
    candidateIds = (data || []).map((r) => r.user_id);
  }

  if (candidateIds.length === 0) {
    return NextResponse.json({ message: "결제 대상이 없습니다.", charged: 0 });
  }

  // 4) 한 사용자씩 결제 시도 (병렬 안 함 — 토스 rate limit 안전)
  const results: { userId: string; ok: boolean; reason?: string }[] = [];
  for (const id of candidateIds) {
    const r = await chargeOne(id, admin);
    results.push(r);
  }

  return NextResponse.json({
    message: "결제 처리 완료",
    charged: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

// ============================================================
// 단일 사용자 결제 처리
// ============================================================
async function chargeOne(
  userId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ userId: string; ok: boolean; reason?: string }> {
  // 1) Atomic 락 획득: status=charging 으로 UPDATE 시도
  // .in("status", CHARGEABLE_STATUSES) 로 결제 가능 상태인 행만 잡음.
  // 다른 호출이 먼저 잡았으면 status 가 이미 'charging' 이라 영향행 0.
  // .select() 로 영향받은 행을 받아서 결제에 필요한 데이터도 같이 가져옴.
  const { data: locked, error: lockError } = await admin
    .from("subscriptions")
    // updated_at 을 명시 설정 — 좀비 charging 복구(batch 의 10분 stale 판정)가
    // updated_at trigger 유무와 무관하게 정확히 동작하도록 락 시각을 기록한다.
    .update({ status: "charging", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", CHARGEABLE_STATUSES as unknown as string[])
    .select("user_id, tier, billing_key, customer_key, customer_email")
    .maybeSingle();

  if (lockError || !locked) {
    return { userId, ok: false, reason: "락 획득 실패 또는 결제 가능 상태 아님" };
  }

  // 2) 필수 데이터 검증
  if (locked.tier === "free" || !locked.billing_key || !locked.customer_key) {
    // 락 풀어주기 (free 였으면 다시 free 로)
    await admin
      .from("subscriptions")
      .update({ status: locked.tier === "free" ? "free" : "past_due" })
      .eq("user_id", userId);
    return { userId, ok: false, reason: "빌링키 없음" };
  }

  if (!locked.customer_email) {
    await admin.from("subscriptions").update({ status: "past_due" }).eq("user_id", userId);
    return { userId, ok: false, reason: "결제 알림 이메일 없음" };
  }

  const tier = locked.tier as Exclude<Tier, "free">;
  const amount = TIER_PRICES[tier];
  const orderId = generateOrderId(userId);
  const orderName = `정책알리미 ${TIER_NAMES[tier]} 월 구독`;

  // 3) 토스에 결제 요청
  try {
    const payment = await chargeBilling({
      billingKey: locked.billing_key,
      customerKey: locked.customer_key,
      amount,
      orderId,
      orderName,
      customerEmail: locked.customer_email,
    });

    // 성공: payment_history 기록
    await admin.from("payment_history").insert({
      user_id: userId,
      payment_key: payment.paymentKey,
      order_id: orderId,
      amount,
      tier,
      status: payment.status,
      paid_at: payment.approvedAt,
      raw_response: payment as unknown as Record<string, unknown>,
    });

    // 결제 확정 검증 (코드리뷰 P1 2026-06-08): HTTP 200 이어도 status 가 DONE 이
    // 아니거나(IN_PROGRESS 등) 승인 금액이 청구액과 다르면 active 승격·기간 연장을
    // 하지 않는다. 미확정 결제에 30일 유료 권한이 부여되는 매출 누수를 차단.
    // 실제 DONE 은 webhook 의 DONE 분기에서 사후 활성화한다.
    if (payment.status !== "DONE" || payment.totalAmount !== amount) {
      await admin
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("user_id", userId);
      return {
        userId,
        ok: false,
        reason: `결제 미확정 (status=${payment.status}, amount=${payment.totalAmount})`,
      };
    }

    // 락 해제 + 다음 결제일 갱신
    const newPeriodEnd = new Date(Date.now() + PERIOD_MS).toISOString();
    await admin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_end: newPeriodEnd,
        trial_ends_at: null,
      })
      .eq("user_id", userId);

    // 영수증 메일 (실패해도 결제는 성공이니 무시)
    await sendReceiptEmail({
      to: locked.customer_email,
      tierName: TIER_NAMES[tier],
      amount,
      paidAt: payment.approvedAt,
      receiptUrl: payment.receipt?.url,
      nextChargeAt: newPeriodEnd,
    }).catch(() => {});

    return { userId, ok: true };
  } catch (err) {
    // 실패: payment_history 에 실패 기록 + 락 해제 (status=past_due)
    const isTossError = err instanceof TossError;
    const code = isTossError ? err.code : "UNKNOWN";
    const message = err instanceof Error ? err.message : "결제 실패";

    // TossError = 토스가 명확히 거절(잔액부족·카드한도 등) → FAILED.
    // non-TossError(타임아웃·네트워크 끊김) = 토스가 승인했는데 응답만 못 받았을 수 있어
    // 결제 진위가 불명확 → status 'UNKNOWN' 으로 기록한다(실제 청구됐는데 FAILED 로
    // 오기록되는 정합성 사고 방지, 코드리뷰 P2). 토스가 보내는 DONE/CANCELED webhook 이
    // payment_history 를 실제 상태로 갱신하므로 운영에서 진위 확인 가능.
    await admin.from("payment_history").insert({
      user_id: userId,
      payment_key: null,
      order_id: orderId,
      amount,
      tier,
      status: isTossError ? "FAILED" : "UNKNOWN",
      failure_code: code,
      failure_reason: message,
    });

    // 어느 경우든 past_due 로 — cron 재청구 대상(trialing/active)에서 빠져 (타임아웃 시)
    // 새 orderId 로 재청구돼 중복 결제되는 것을 막는다.
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("user_id", userId);

    return { userId, ok: false, reason: message };
  }
}
