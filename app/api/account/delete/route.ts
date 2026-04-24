// ============================================================
// 회원 탈퇴 API — /api/account/delete
// ============================================================
// 2026-04-24 Phase 2 Step 3: 즉시 삭제 → 30일 유예 soft delete 로 전환.
//
// 기본 동작 (body 없음 또는 { final: false }):
//   1) pending_deletions 에 upsert (scheduled_delete_at = now + 30일)
//   2) admin_actions.self_delete_requested 감사 로그
//   3) signOut → 클라이언트 쿠키 해제. 다시 로그인 시 middleware 가
//      /account/restore 로 리다이렉트.
//
// 즉시 최종 삭제 ({ final: true }):
//   - 복구 페이지 "지금 영구 삭제" 버튼에서만 호출. pending_deletions row 가
//     반드시 있어야 허용 (= 이미 유예 요청 상태여야 함).
//   - admin_actions.self_deleted 기록 → auth.admin.deleteUser (CASCADE 로
//     pending_deletions · 기타 모든 user_id FK 일괄 삭제)
//
// 차단 조건:
//   - 비로그인 → 401
//   - 활성 구독(trialing/active/charging/past_due) → 409
//   - final=true 인데 pending_deletions row 없음 → 400
//
// 30일 경과 후 자동 최종 삭제는 별도 cron (/api/finalize-deletions, Step 2c).
//
// 법적 주의: 전자상거래법 결제 기록 5년 보존 의무 — 라이브 결제 활성화 후
// subscription_events 익명화 방식으로 재설계 필요.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";

// 유예 기간 — 30일. 사용자가 "실수 탈퇴" 로부터 복구할 충분한 창.
const GRACE_DAYS = 30;

// 탈퇴 차단 구독 상태 — 청구/체험 진행 중이면 먼저 구독 취소
const BLOCKING_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "charging",
  "past_due",
];

// WithdrawSection 이 보내는 사유 value 화이트리스트 — 임의 문자열 주입·집계 오염 방지
const VALID_REASONS = new Set([
  "no_content",
  "alert_fatigue",
  "other_service",
  "complexity",
  "privacy",
  "etc",
]);
const REASON_DETAIL_MAX = 200;

// 이메일 앞 2글자 + 도메인만 노출 — 감사 로그 PII 최소화
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/^(.{1,2})(.*)(@.+)$/);
  return m ? `${m[1]}***${m[3]}` : "***";
}

export async function POST(req: NextRequest) {
  // 1) 본인 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2) body 파싱
  const body = await req.json().catch(() => ({}));
  const rawReason = typeof body?.reason === "string" ? body.reason : null;
  const reason = rawReason && VALID_REASONS.has(rawReason) ? rawReason : null;
  const rawDetail =
    typeof body?.reason_detail === "string" ? body.reason_detail : null;
  const reasonDetail = rawDetail
    ? rawDetail.trim().slice(0, REASON_DETAIL_MAX) || null
    : null;
  const final = body?.final === true;

  // 3) 활성 구독 차단 (즉시/유예 공통 가드)
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

  // 4) final=true → 복구 페이지에서 "지금 영구 삭제" 요청. 유예 row 필수.
  if (final) {
    const { data: pending } = await admin
      .from("pending_deletions")
      .select("requested_at, reason, reason_detail")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pending) {
      return NextResponse.json(
        {
          error:
            "탈퇴 요청 상태가 아니에요. 마이페이지에서 먼저 탈퇴를 요청해 주세요.",
        },
        { status: 400 },
      );
    }

    // 감사 로그 — 최종 삭제. 사유는 pending row 의 것을 그대로 이관.
    try {
      await logAdminAction({
        actorId: user.id,
        targetUserId: user.id,
        action: "self_deleted",
        details: {
          user_id_at_deletion: user.id,
          email_masked: maskEmail(user.email),
          reason: pending.reason ?? "unspecified",
          reason_detail: pending.reason_detail,
          had_subscription: !!sub,
          subscription_status_at_deletion: sub?.status ?? null,
          finalize_source: "user_immediate",
          requested_at: pending.requested_at,
        },
      });
    } catch (logErr) {
      console.warn("[api/account/delete] self_deleted 기록 실패:", logErr);
    }

    // auth.users 삭제 → CASCADE 로 pending_deletions·기타 모든 user_id FK 일괄 삭제
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

    await supabase.auth.signOut();
    return NextResponse.json({ ok: true, final: true });
  }

  // 5) 기본 경로 — 30일 유예 soft delete.
  //    이미 pending 상태여도 최신 사유로 갱신 (upsert). scheduled_delete_at 도 재설정.
  const now = new Date();
  const scheduledDeleteAt = new Date(
    now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error: pendingErr } = await admin.from("pending_deletions").upsert({
    user_id: user.id,
    email: user.email ?? "",
    requested_at: now.toISOString(),
    scheduled_delete_at: scheduledDeleteAt.toISOString(),
    reason,
    reason_detail: reasonDetail,
  });
  if (pendingErr) {
    console.error("[api/account/delete] pending_deletions upsert 실패:", {
      userId: user.id,
      message: pendingErr.message,
    });
    return NextResponse.json(
      { error: "탈퇴 요청 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 6) 감사 로그 — 탈퇴 요청 시점 기록. 실패해도 요청 자체는 성공 처리 (fail-open).
  try {
    await logAdminAction({
      actorId: user.id,
      targetUserId: user.id,
      action: "self_delete_requested",
      details: {
        email_masked: maskEmail(user.email),
        reason: reason ?? "unspecified",
        reason_detail: reasonDetail,
        had_subscription: !!sub,
        subscription_status_at_deletion: sub?.status ?? null,
        scheduled_delete_at: scheduledDeleteAt.toISOString(),
        grace_days: GRACE_DAYS,
      },
    });
  } catch (logErr) {
    console.warn(
      "[api/account/delete] self_delete_requested 기록 실패:",
      logErr,
    );
  }

  // 7) 세션 무효화 — 클라이언트 쿠키 제거. 다시 로그인 시 middleware 가
  //    /account/restore 로 강제 리다이렉트. 30일 내 복구 창구 역할.
  await supabase.auth.signOut();

  return NextResponse.json({
    ok: true,
    scheduled_delete_at: scheduledDeleteAt.toISOString(),
    grace_days: GRACE_DAYS,
  });
}
