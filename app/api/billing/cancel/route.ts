// ============================================================
// /api/billing/cancel — 구독 해지
// ============================================================
// 본인만 호출 가능 (auth.getUser() 검증).
// 실제로는 즉시 구독 종료가 아니라 status='cancelled' + cancelled_at 기록.
// current_period_end 까지는 계속 사용 가능 (이미 결제한 기간).
// 다음 cron 호출 시 결제 시도 안 함.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 현재 구독 상태 확인
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, current_period_end, tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ error: "구독 정보가 없습니다." }, { status: 404 });
  }

  if (subscription.tier === "free") {
    return NextResponse.json({ error: "무료 플랜은 해지할 수 없습니다." }, { status: 400 });
  }

  if (subscription.status === "cancelled") {
    return NextResponse.json({ error: "이미 해지된 구독입니다." }, { status: 400 });
  }

  // 해지 처리: status='cancelled' + cancelled_at=now()
  // current_period_end 는 그대로 유지 (그날까지 사용 가능)
  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "해지 처리에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    message: "구독이 해지되었습니다.",
    accessUntil: subscription.current_period_end,
  });
}
