// ============================================================
// /api/admin/mark-toss-billing-approved — 토스페이먼츠 빌링 심사 통과 1 click 신고
// ============================================================
// 사장님이 카드사 빌링 계약 심사 통과 후 GET 한 번 호출.
// admin_actions.toss_billing_approved audit insert → PendingExternalActionsCard 자동 hide.
//
// 인증: admin 로그인 (requireAdminUser).
// 멱등성: 중복 insert OK (audit 누적, 추가 row 만 발생, 동작 영향 0).
// 패턴: /api/admin/mark-security-rotation 와 1:1 동일.
// ============================================================

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function run() {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  await logAdminAction({
    actorId: user.id,
    action: "toss_billing_approved" as AdminActionType,
    details: {
      reported_at: new Date().toISOString(),
      source: "tosspayments_billing_card_company_review",
      ppt_commit: "0e0eac2",
    },
  });

  return NextResponse.json({
    ok: true,
    message: "토스 빌링 심사 통과 신고. PendingExternalActionsCard 자동 hide.",
  });
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
