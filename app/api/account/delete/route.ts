// ============================================================
// 회원 탈퇴 API — /api/account/delete
// ============================================================
// POST 로 본인 계정 즉시 삭제. 모든 user_id FK 가 ON DELETE CASCADE 로
// 걸려있어 auth.users 에서 삭제하면 user_profiles · user_alert_rules ·
// alert_deliveries · subscriptions · subscription_events · ai_usage_log ·
// consent_log 가 자동 연쇄 삭제됨.
//
// 차단 조건:
//   - 비로그인 → 401
//   - 활성 구독(trialing/active/charging/past_due) 보유 → 409
//     (먼저 구독 취소 후 재시도 안내)
//
// Phase 1 MVP:
//   - 구독 없는 사용자만 즉시 탈퇴
//   - 탈퇴 사유 수집·유예 기간·로그 남기기는 추후 (Phase 2)
//
// 법적 주의:
//   - 전자상거래법상 결제 기록 5년 보존 의무가 있지만, 토스 측 대시보드에
//     결제 기록이 남아있고 현재는 테스트 키 단계라 즉시 cascade 삭제로 시작.
//     라이브 결제 활성화 후에는 subscription_events 익명화 방식으로 재설계 필요.
//
// Phase 2 TODO:
//   - 토스 빌링키 해지 API 호출. 현재는 구독 cancelled 상태 사용자 탈퇴 시
//     DB 의 빌링키 레코드만 제거되고 토스 서버엔 잔존 가능. 자동결제는 cancelled
//     라 안 나가지만 "완전 제거" 원칙상 Phase 2 에서 `/v1/billing/cancel` 같은
//     토스 API 로 정리 필요.
//   - 어드민 본인 탈퇴 시 추가 경고 (ADMIN_USER_IDS 에 남은 운영자 수 확인).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 탈퇴를 차단하는 구독 상태 — 청구/체험 진행 중이면 먼저 정리 필요
const BLOCKING_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "charging",
  "past_due",
];

export async function POST(_req: NextRequest) {
  // 1) 본인 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2) 활성 구독 차단
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (sub && BLOCKING_SUBSCRIPTION_STATUSES.includes(sub.status)) {
    return NextResponse.json(
      {
        error:
          "구독이 진행 중이에요. 마이페이지 > 결제·구독에서 먼저 구독을 취소한 뒤 다시 시도해 주세요.",
      },
      { status: 409 },
    );
  }

  // 3) auth.users 삭제 → CASCADE 로 모든 관련 데이터 자동 삭제
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[api/account/delete] auth.users 삭제 실패:", {
      userId: user.id,
      message: delErr.message,
    });
    return NextResponse.json(
      { error: "탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 4) 현재 세션 쿠키 제거 — 클라이언트도 로그인 상태 해제
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
