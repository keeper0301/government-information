// ============================================================
// 계정 복구 API — /api/account/restore
// ============================================================
// 30일 유예 기간 내 사용자가 "복구" 버튼 누르면 pending_deletions row 삭제.
// auth.users 는 그대로 남아있으므로 즉시 정상 로그인 가능 상태로 돌아감.
//
// 인증:
//   - supabase.auth.getUser() 로 본인 확인
//   - RLS 가 pending_deletions 조회를 본인 row 로만 제한하지만, DELETE 는
//     service_role 로 수행 (/api/account/restore 가 확인 후 명시 삭제)
//
// 반환:
//   - 성공: { ok: true }
//   - pending 없음: { ok: false, reason: "not_pending" } 200
//     (UX: 복구 페이지가 pending 없으면 홈으로 유도. 에러 status 는 아님.)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const admin = createAdminClient();

  // pending 상태 확인 후 삭제. 없으면 이미 복구됐거나 최초 상태 → OK (no-op) 로 응답.
  const { data: pending, error: fetchErr } = await admin
    .from("pending_deletions")
    .select("requested_at, scheduled_delete_at, reason")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[api/account/restore] pending 조회 실패:", {
      userId: user.id,
      message: fetchErr.message,
    });
    return NextResponse.json(
      { error: "복구 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  if (!pending) {
    return NextResponse.json({ ok: false, reason: "not_pending" });
  }

  // 삭제 실행
  const { error: delErr } = await admin
    .from("pending_deletions")
    .delete()
    .eq("user_id", user.id);
  if (delErr) {
    console.error("[api/account/restore] pending 삭제 실패:", {
      userId: user.id,
      message: delErr.message,
    });
    return NextResponse.json(
      { error: "복구 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 감사 로그 — 복구 시점. 사유는 pending row 에 있던 값을 참고용으로 함께 보존.
  try {
    await logAdminAction({
      actorId: user.id,
      targetUserId: user.id,
      action: "self_delete_restored",
      details: {
        original_requested_at: pending.requested_at,
        original_scheduled_delete_at: pending.scheduled_delete_at,
        original_reason: pending.reason ?? null,
      },
    });
  } catch (logErr) {
    console.warn(
      "[api/account/restore] self_delete_restored 기록 실패:",
      logErr,
    );
  }

  return NextResponse.json({ ok: true });
}
