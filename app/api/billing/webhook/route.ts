// ============================================================
// /api/billing/webhook — 토스페이먼츠 웹훅 수신
// ============================================================
// 토스가 결제 상태가 변경될 때 (DONE / CANCELED / FAILED 등)
// 이 엔드포인트로 POST 요청을 보냄.
//
// 보안: 토스는 IP 기반 인증을 권장하지만, 추가 안전장치로
//   webhook 수신 후 paymentKey 를 토스 API 로 다시 조회해서
//   진위를 검증함 (가짜 webhook 차단).
//
// 처리:
//   PAYMENT_STATUS_CHANGED → payment_history 갱신
//   상태에 따라 subscriptions.status 도 업데이트
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, TossError } from "@/lib/toss";

type WebhookPayload = {
  eventType: string;
  createdAt: string;
  data: {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    [key: string]: unknown;
  };
};

export async function POST(request: NextRequest) {
  // 1) body 파싱
  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 형식의 요청입니다." }, { status: 400 });
  }

  // 2) 지원하는 이벤트만 처리
  if (payload.eventType !== "PAYMENT_STATUS_CHANGED") {
    // 알 수 없는 이벤트는 200 으로 ack 만 (토스가 재시도하지 않도록)
    return NextResponse.json({ status: "ignored", eventType: payload.eventType });
  }

  const paymentKey = payload.data.paymentKey;
  const orderId = payload.data.orderId;

  if (!paymentKey || !orderId) {
    return NextResponse.json({ error: "필수 데이터 누락" }, { status: 400 });
  }

  // 3) 보안: 토스 API 로 직접 결제 조회해서 진위 확인
  // 가짜 webhook 으로 결제 상태 조작 방지
  let payment;
  try {
    payment = await getPayment(paymentKey);
  } catch (err) {
    const code = err instanceof TossError ? err.code : "UNKNOWN";
    return NextResponse.json({ error: "결제 조회 실패", code }, { status: 400 });
  }

  // 토스 API 가 돌려준 status 가 진실 (webhook payload 의 status 가 아니라)
  const realStatus = payment.status;

  const admin = createAdminClient();

  // 4) payment_history 업데이트
  // 우리가 발급한 orderId 로 행 찾기 (없으면 무시 — 우리 DB 에 없는 결제)
  await admin
    .from("payment_history")
    .update({
      status: realStatus,
      paid_at: payment.approvedAt || null,
      raw_response: payment as unknown as Record<string, unknown>,
    })
    .eq("order_id", orderId);

  // 5) subscription status 동기화
  // FAILED / CANCELED → past_due (사용자에게 재결제 유도)
  // DONE → active 유지 (이미 charge 라우트에서 처리됨, webhook 은 보조)
  if (realStatus === "FAILED" || realStatus === "ABORTED" || realStatus === "CANCELED") {
    // user_id 찾기 (payment_history 에서)
    const { data: history } = await admin
      .from("payment_history")
      .select("user_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (history?.user_id) {
      await admin
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("user_id", history.user_id);
    }
  }

  return NextResponse.json({ status: "success" });
}
