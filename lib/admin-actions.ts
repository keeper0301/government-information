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
  | "manual_alert_send"   // 수동 알림 재전송 (Phase 2)
  | "alimtalk_test"       // 어드민 테스트 발송 (대행사·템플릿 심사 후 검증)
  | "enrich_detail_manual" // /api/enrich 수동 트리거 (공고 빈 필드 채움 급할 때)
  | "collect_news_manual"  // /api/collect-news 수동 트리거 (korea.kr RSS 즉시 수집)
  | "self_delete_requested" // 본인 탈퇴 요청 (pending_deletions insert, 30일 유예 시작)
  | "self_delete_restored"  // 유예 기간 내 복구 (pending_deletions row 삭제)
  | "self_deleted"          // 최종 삭제 완료 — cron finalize 또는 즉시 삭제 요청 시. FK cascade 로 actor/target SET NULL
  | "blog_edit"             // 블로그 글 수정 (title/meta/content/category/tags 등)
  | "blog_publish"          // 미발행 → 발행 전환
  | "blog_unpublish";       // 발행 → 미발행 전환 (임시 비공개)

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

// ━━━ 특정 어드민이 수행한 감사 로그 조회 ━━━
// /admin/my-actions 페이지가 사용. 사장님 본인 회고용 ("내가 언제 뭐 했지?").
// target_user_id 가 NULL (대상 사용자 삭제됨) 인 기록도 함께 돌려줌 — 수행 이력은 유지.
export async function getActorActions(
  actorId: string,
  limit = 50,
): Promise<AdminActionRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select("id, actor_id, target_user_id, action, details, created_at")
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[admin_actions.getActorActions] 조회 실패:", {
      actorId,
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

// ━━━ 페이지네이션용 — 총 건수와 함께 반환 ━━━
// /admin/my-actions 에서 페이지 이동용. 기존 getActorActions 와 병존 —
// 반환 타입 다르므로 호출자가 필요에 맞춰 선택.
// range(offset, offset+limit-1) + count:'exact' 로 한 쿼리에 처리.
// 2026-04-24: 기간 필터(from/to) 추가 — /admin/my-actions 에서 특정 기간
// 회고 시 사용. YYYY-MM-DD 문자열 ISO 기준 포함·배타 (from <= ~ < to+1일).
export async function getActorActionsPaged(
  actorId: string,
  {
    limit = 30,
    offset = 0,
    from,
    to,
  }: { limit?: number; offset?: number; from?: string; to?: string } = {},
): Promise<{ records: AdminActionRecord[]; total: number }> {
  const admin = createAdminClient();
  let query = admin
    .from("admin_actions")
    .select("id, actor_id, target_user_id, action, details, created_at", {
      count: "exact",
    })
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false });

  // 기간 필터 (ISO date YYYY-MM-DD). KST 기준 하루 단위.
  // created_at 은 UTC timestamptz — 한국 사용자가 "4/20" 을 누르면 KST 4/20 00:00 ~ KST 4/21 00:00 조회.
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const fromKst = new Date(`${from}T00:00:00+09:00`).toISOString();
    query = query.gte("created_at", fromKst);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    // to 는 배타 — "4/20 ~ 4/20" 이면 4/20 하루 전체 포함해야 하니 +1일
    const toDate = new Date(`${to}T00:00:00+09:00`);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("created_at", toDate.toISOString());
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.warn("[admin_actions.getActorActionsPaged] 조회 실패:", {
      actorId,
      message: error.message,
    });
    return { records: [], total: 0 };
  }

  const records = (data ?? []).map(
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

  return { records, total: count ?? 0 };
}

// ━━━ 액션 타입 → 한글 라벨 ━━━
// UI 표시용. 새 action 추가 시 여기도 매핑 추가.
export const ACTION_LABELS: Record<AdminActionType, string> = {
  reset_ai_quota: "AI 쿼터 초기화",
  manual_delete_user: "수동 탈퇴 처리",
  update_tier: "구독 티어 변경",
  manual_alert_send: "수동 알림 전송",
  alimtalk_test: "알림톡 테스트 발송",
  enrich_detail_manual: "공고 상세 수동 보강",
  collect_news_manual: "정책 뉴스 수동 수집",
  self_delete_requested: "본인 탈퇴 요청 (유예)",
  self_delete_restored: "본인 탈퇴 복구",
  self_deleted: "본인 탈퇴 최종 완료",
  blog_edit: "블로그 글 수정",
  blog_publish: "블로그 글 발행",
  blog_unpublish: "블로그 글 비공개",
};
