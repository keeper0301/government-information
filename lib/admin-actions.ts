// ============================================================
// 관리자 액션 감사 로그 헬퍼
// ============================================================
// admin_actions 테이블에 기록/조회하는 서버 전용 유틸.
// 클라이언트 직접 호출 금지 (service_role key 사용).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

// 액션 종류 — 새 종류 추가 시 여기에 한 줄. /admin/users 감사 로그 Panel 의 라벨도 같이 업데이트.
export type AdminActionType =
  | "reset_ai_quota"      // 오늘 AI 사용 카운트 0 초기화
  | "manual_delete_user"  // 어드민 수동 탈퇴 처리 (Phase 2)
  | "update_tier"         // 구독 티어 수동 변경 (Phase 2)
  | "manual_alert_send";  // 수동 알림 재전송 (Phase 2)

export type AdminActionRecord = {
  id: string;
  actorId: string | null;
  targetUserId: string | null;
  action: AdminActionType;
  details: Record<string, unknown> | null;
  createdAt: string;
};

// ━━━ 액션 기록 ━━━
// 서버 컴포넌트 / server action 에서만 호출. 실패는 throw (감사 로그 손실이
// 상위 작업을 막으면 안 되는 경우엔 호출자가 try/catch).
export async function logAdminAction(input: {
  actorId: string;
  targetUserId?: string | null;
  action: AdminActionType;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_actions").insert({
    actor_id: input.actorId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    details: input.details ?? null,
  });
  if (error) {
    // 로그 저장 실패는 운영상 중요 — 호출자가 fail-fast 선택 가능
    throw new Error(`admin_actions 기록 실패: ${error.message}`);
  }
}

// ━━━ 특정 사용자 대상 감사 로그 조회 ━━━
// /admin/users/[userId] 의 Panel 이 사용.
export async function getTargetActions(
  targetUserId: string,
  limit = 20,
): Promise<AdminActionRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select("id, actor_id, target_user_id, action, details, created_at")
    .eq("target_user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // 감사 로그 조회 실패는 UI 가 "기록 없음" 으로 fallback — 운영 추적용으로 경고만
    console.warn("[admin_actions.getTargetActions] 조회 실패:", {
      targetUserId,
      message: error.message,
    });
    return [];
  }
  if (!data) return [];

  return data.map(
    (r: {
      id: string;
      actor_id: string | null;
      target_user_id: string | null;
      action: string;
      details: Record<string, unknown> | null;
      created_at: string;
    }) => ({
      id: r.id,
      actorId: r.actor_id,
      targetUserId: r.target_user_id,
      action: r.action as AdminActionType,
      details: r.details,
      createdAt: r.created_at,
    }),
  );
}

// ━━━ 액션 타입 → 한글 라벨 ━━━
// UI 표시용. 새 action 추가 시 여기도 매핑 추가.
export const ACTION_LABELS: Record<AdminActionType, string> = {
  reset_ai_quota: "AI 쿼터 초기화",
  manual_delete_user: "수동 탈퇴 처리",
  update_tier: "구독 티어 변경",
  manual_alert_send: "수동 알림 전송",
};
