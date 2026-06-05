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
  | "enrich_detail_skip_reset" // 058: 영구 skip 도장 일괄 해제 (외부 API 회복 시)
  | "collect_news_manual"  // /api/collect-news 수동 트리거 (korea.kr RSS 즉시 수집)
  | "self_delete_requested" // 본인 탈퇴 요청 (pending_deletions insert, 30일 유예 시작)
  | "self_delete_restored"  // 유예 기간 내 복구 (pending_deletions row 삭제)
  | "self_deleted"          // 최종 삭제 완료 — cron finalize 또는 즉시 삭제 요청 시. FK cascade 로 actor/target SET NULL
  | "blog_edit"             // 블로그 글 수정 (title/meta/content/category/tags 등)
  | "blog_publish"          // 미발행 → 발행 전환
  | "blog_unpublish"        // 발행 → 미발행 전환 (임시 비공개)
  | "news_hide"             // 정책 뉴스 비공개 (저작권·오보 모더레이션)
  | "news_unhide"           // 정책 뉴스 복원 (잘못 숨긴 경우 또는 사유 해소)
  | "news_auto_hide"        // LLM 자동 분류로 광고성·저작권 의심 자동 숨김 (system actor=null)
  | "news_classify_run"     // /api/cron/news-classify cron 실행 통계 (cap·fetched·duration_ms 등 — 진단용)
  | "dedupe_auto_confirm"   // dedupe-detect cron 이 score ≥ 0.95 자동 confirm (system actor=null)
  | "manual_cron_trigger"  // /admin/cron-trigger 수동 cron 실행 (Phase 5)
  | "csv_export"           // /api/admin/export-users CSV 다운로드 (Phase 6 #9)
  | "manual_program_create" // /admin/welfare/new · /admin/loan/new 수동 정책 등록 (#7)
  | "auto_press_ingest"     // /api/cron/press-ingest cron 자동 등록 (광역 보도자료 → welfare/loan)
  | "press_l2_classify"     // /api/cron/press-ingest L2 분류 후보 저장
  | "press_l2_confirm"      // /admin/press-ingest L2 후보 승인 후 정책 등록
  | "press_l2_reject"       // /admin/press-ingest L2 후보 해제
  | "dedupe_confirm"        // Phase 3 B3 — /admin/dedupe 에서 중복 후보 확정 (duplicate_of_id 유지)
  | "dedupe_reject"         // Phase 3 B3 — 잘못 잡힌 후보 reset (duplicate_of_id NULL)
  | "health_alert_run"      // Phase 1 — /api/cron/health-alert 매일 09:00 KST 실행 흔적 (alert 0 도 기록 → cron 노쇼 진단 가능)
  | "press_l2_auto_revoke"  // 자동 등록 정책 회수 (is_hidden=true) — 자동 confirm 후 사장님 검토에서 부적합 판단
  | "press_l2_auto_restore" // 잘못 회수한 정책 복원 (is_hidden=false)
  | "cancellation_followup_sent" // A2 — 결제 해지 사용자에게 자동 재가입 안내 메일 발송 (중복 방지 audit)
  | "category_backfill_run"      // A4 — 카테고리 누락 정책 LLM 자동 보강 (cron 1회 실행 통계)
  | "blog_quality_flag"          // A1 — 블로그 글 LLM 품질 평가 score ≤ 2 사장님 검수 큐 표시
  | "nps_invite_sent"            // C3 — 가입 7일 후 NPS 설문 메일 발송 (중복 방지 audit)
  | "sns_publish_run"            // C1 — blog 1건 SNS 4종 자동 게시 결과 (channel별 ok/reason)
  | "cron_retry_run"             // 가-A1 — failed cron 자동 1회 재시도 audit (job별 retry status)
  | "vercel_deploy_failed"       // 가-A2 — Vercel deployment 실패 webhook 수신 (사장님 텔레그램 알림)
  | "llm_usage_summary"          // 가-A3 — 24h LLM 호출 cron audit 합산 통계
  | "instagram_publish_success"  // 인스타 carousel 자동 발행 성공 (media_id + permalink 저장)
  | "instagram_publish_fail"     // 인스타 발행 실패 (3회 누적 시 health-alert 트리거)
  | "instagram_token_refresh"    // 매월 1일 long-lived token 갱신 cron 결과
  | "instagram_publish_skipped"  // 2026-05-12 — 정지 예방 안전책으로 cron skip (outside_hours, daily_cap_reached, not_configured, disabled)
  | "instagram_attempt_count_update_failed" // 2026-05-12 — cron UPDATE attempt_count 가 row 0 영향이면 audit (RLS/권한/eq match 진단용)
  | "naver_cookies_uploaded"     // 2026-05-12 — Phase 2-B 사장님 Chrome export cookies 업로드 audit
  | "naver_manual_test"          // 2026-05-12 — Phase 2-C 사장님 manual-test 페이지에서 dry-run/실제 발행 trigger audit
  | "policy_url_check_run"       // 2026-05-14 — 주 1회 정책 source URL 404 감지 cron 실행 (checked/dead/ok 통계)
  | "collect_run"                // 2026-05-14 — /api/collect GitHub Actions 가동 흔적 (totalCollected/sources/failedCount 통계, health-alert collect_no_show 진단)
  | "press_ingest_run"           // 2026-05-14 — /api/cron/press-ingest 진입 흔적 (cron 가동 자체 추적, press_l2_classify 가 처리한 만큼만 쌓이는 false positive 차단)
  | "alert_dispatch_run"         // 2026-05-14 — /api/alert-dispatch 진입 흔적 (alert_deliveries 가 매칭 0건 시 row 안 쌓여 cron 가동 추적 불가능했음)
  | "external_console_check_run" // 2026-05-14 — /api/cron/external-console-check 진입 흔적 (balance·KPI 등 vercel logs 만 있어 사장님 가시성 0이던 사고)
  | "daily_digest_run"           // 2026-05-14 — /api/cron/daily-digest 매일 KST 08:00 사장님 KPI SMS 가동 흔적
  | "weekly_ops_digest_run"      // 2026-05-14 — /api/cron/weekly-ops-digest 매주 KST 09:00 사장님 운영 보고 가동 흔적
  | "sentry_daily_summary_run"   // 2026-05-14 — /api/cron/sentry-daily-summary 매일 KST 09:45 텔레그램 발송 가동 흔적
  | "onboarding_reminder_run"    // 2026-05-14 — /api/cron/onboarding-reminder 매일 KST 11:05 가입 24h~48h 환영 메일 가동 흔적
  | "policy_enrich_run"          // 2026-05-14 — /api/cron/policy-enrich 매일 KST 03:30 키워드/요약 enrich 가동 흔적
  | "weekly_digest_run"          // 2026-05-14 — /api/cron/weekly-digest 매주 월 KST 09:00 사용자 주간 다이제스트 가동 흔적
  | "support_reminder_run"       // 2026-05-14 — /api/cron/support-reminder 매일 KST 09:15 미답변 ticket SMS reminder 가동 흔적
  | "autonomous_improvement_scan_run" // 2026-05-16 — 운영 신호 기반 자동 개선 과제 도출 cron
  | "local_press_scrape"              // 2026-05-16 — Phase B 시·군 보도자료 수집 (순천시청 첫 시범)
  | "local_press_scrape_run"          // 2026-05-16 — Phase B 매일 KST 09:00 cron 가동 흔적
  | "weekly_scrape_monitor_run"       // 2026-05-16 — Phase D-1 매주 월 KST 09:30 진단 cron
  | "popularity_snapshot_run"         // 2026-05-17 — A 12차 매일 KST 03:00 popularity 30일 추세 누적
  | "sns_publish_popular_policy_run"  // 2026-05-17 — B 1차 매주 월 KST 10:00 인기 정책 SNS 자동 노출
  | "gemini_quota_alert"              // 2026-05-17 — G1 Gemini 429 spending cap 사고 자동 감지·알림 (24h cooldown)
  | "press_low_reminder_run"          // 2026-05-17 — G2 low pending 매주 월 텔레그램 reminder + 90일 archived cron
  | "external_console_alert_sent"     // 2026-05-17 — G7 external-console-check per-key 24h dedupe (SMS fatigue 차단)
  | "naver_news_collect_run"          // 2026-05-18 — 17 광역 collect-news cron 진입 흔적 (가시성 0 사고 해소)
  | "agent_diagnose_run"              // 2026-05-18 — Phase 6 Codex 자율 운영 W0: /api/agent/diagnose 호출 흔적
  | "agent_execute_run"               // 2026-05-18 — Phase 6 Codex 자율 운영: /api/agent/execute 호출 흔적 (W1+)
  | "adsense_review_state"            // 2026-05-18 — AdSense 검수 결과 자동 감지 cron 이 매일 polling 한 state + 전환 history
  | "blog_publish_summary_run"        // 2026-05-18 — 매일 KST 07:30 블로그 24h 발행 누적 텔레그램 cron (5/18 OpenAI 사고 학습)
  | "blog_short_content_alert"        // 2026-05-18 — LLM 본문 짧음 사고 자동 감지 (5/18 OpenAI 사각 학습) + 24h cooldown
  | "blog_openai_fallback_alert"      // 2026-06-05 — Gemini 실패 시 OpenAI(gpt-4o) 비상 백업 발동 조기경보 (24h cooldown)
  | "adsense_gmail_match"             // 2026-05-18 — D 옵션 AdSense 이메일 Gmail 자동 파싱 + verdict 분류 + 24h dedup
  | "naver_extension_idle_check"      // 2026-05-18 — Naver Extension 1주 미가동 자동 reminder cron audit
  | "security_rotation_done"          // 2026-05-19 — 사장님 보안 회전 완료 신고 (PendingExternalActionsCard 자동 hide trigger)
  | "render_plan_upgraded"            // 2026-05-19 — Render Starter plan 업그레이드 신고 (Codex sidecar cycle 정상화 신호)
  | "toss_billing_approved"           // 2026-05-26 — 토스페이먼츠 빌링 카드사 심사 통과 신고 (사장님 1 click, PendingExternalActionsCard 자동 hide)
  | "press_confidence_tune_run"       // 2026-05-27 — Spec 1 자가 진화 학습 매주 월 KST 02:00 tier_floor 자동 튜닝 cron
  | "popularity_weights_tune_run"     // 2026-05-27 — Spec 2 자가 진화 학습 매주 월 KST 02:30 popularity weights 자동 튜닝 cron
  | "push_send_run"                   // 2026-05-27 — Spec 3-A PWA 푸시 발송 매시 cron (사용자별 preferred_hours 매칭)
  | "push_time_learn_run"             // 2026-05-27 — Spec 3-B PWA 푸시 시점 자가 진화 학습 매주 월 KST 03:00 cron
  | "self_learning_digest_run"       // 2026-05-27 — 자가 진화 학습 3 cron 결과 텔레그램 요약 매주 월 KST 03:30
  | "adsense_review_mode_disabled"   // 2026-05-31 — AdSense Phase B 사장님 1-tap 으로 review mode off + Vercel API redeploy 완료 신고
  | "adsense_deployment_state_resolved" // 2026-05-31 — Critical #2 polling: Phase B 후 deployment state(READY/ERROR) 텔레그램 follow-up 완료 표시 (dedup)
  | "press_tier_manual_override"     // 2026-05-31 — P3 #1 사장님 수동 override: press_auto_confirm_settings.tier_floor 강제 변경
  | "weights_manual_override";       // 2026-05-31 — P3 #1 사장님 수동 override: popularity_weights_history view/apply/max_boost 강제 변경

export type AdminActionRecord = {
  id: string;
  actorId: string | null;
  targetUserId: string | null;
  action: AdminActionType;
  details: Record<string, unknown> | null;
  createdAt: string;
};

// ━━━ 액션 기록 ━━━
// 서버 컴포넌트 / server action / cron 에서 호출. 실패는 throw (감사 로그
// 손실이 상위 작업을 막으면 안 되는 경우엔 호출자가 try/catch).
// actorId=null 은 system actor (cron 자동 작업) — FK ON DELETE SET NULL 와 일관.
export async function logAdminAction(input: {
  actorId: string | null;
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
// 2026-04-29: 검색어(q) 추가 — 한국어 라벨 매칭(예: "탈퇴" → manual_delete_user/
// self_delete_requested/self_delete_restored/self_deleted), 영어 enum ILIKE,
// UUID 형식이면 target_user_id 정확 매칭. 매칭 결과 없으면 빈 배열 반환.
export async function getActorActionsPaged(
  actorId: string,
  {
    limit = 30,
    offset = 0,
    from,
    to,
    q,
  }: { limit?: number; offset?: number; from?: string; to?: string; q?: string } = {},
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

  // 검색어 필터 — q 가 비어있지 않으면 OR 조건 결합
  if (q && q.trim().length > 0) {
    const term = q.trim();
    // 1) 한국어 라벨 매칭: ACTION_LABELS 에서 라벨에 term 포함된 enum 키 모음
    const labelMatchedActions = (
      Object.entries(ACTION_LABELS) as [AdminActionType, string][]
    )
      .filter(([, label]) => label.includes(term))
      .map(([key]) => key);

    // 2) UUID 형식이면 target_user_id 정확 매칭 (사용자 추적용)
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidMatch = uuidRe.test(term) ? term : null;

    // 3) 영어 enum ILIKE — PostgREST 의 ilike 는 % 메타문자만, term 에 % 들어있으면 그대로 통과
    //    (사용자가 의도적 wildcard 쓰면 그대로 활용)
    const ilikeTerm = term.replace(/[,()]/g, ""); // PostgREST or() 구분자 충돌 방지

    // OR 절 조립
    const orParts: string[] = [];
    if (labelMatchedActions.length > 0) {
      orParts.push(`action.in.(${labelMatchedActions.join(",")})`);
    }
    if (ilikeTerm.length > 0) {
      orParts.push(`action.ilike.%${ilikeTerm}%`);
    }
    if (uuidMatch) {
      orParts.push(`target_user_id.eq.${uuidMatch}`);
    }

    if (orParts.length > 0) {
      query = query.or(orParts.join(","));
    } else {
      // 매칭 가능한 조건 자체가 없으면 빈 결과 (정상 분기)
      return { records: [], total: 0 };
    }
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
  enrich_detail_skip_reset: "공고 영구 skip 해제",
  collect_news_manual: "정책 뉴스 수동 수집",
  self_delete_requested: "본인 탈퇴 요청 (유예)",
  self_delete_restored: "본인 탈퇴 복구",
  self_deleted: "본인 탈퇴 최종 완료",
  blog_edit: "블로그 글 수정",
  blog_publish: "블로그 글 발행",
  blog_unpublish: "블로그 글 비공개",
  news_hide: "정책 뉴스 비공개",
  news_unhide: "정책 뉴스 복원",
  news_auto_hide: "정책 뉴스 자동 숨김 (LLM)",
  news_classify_run: "뉴스 분류 cron 실행 통계",
  dedupe_auto_confirm: "중복 정책 자동 확정 (score ≥ 0.95)",
  manual_cron_trigger: "Cron 수동 실행",
  csv_export: "CSV 내보내기",
  manual_program_create: "정책 수동 등록",
  auto_press_ingest: "정책 자동 등록 (cron)",
  press_l2_classify: "보도자료 L2 분류",
  press_l2_confirm: "보도자료 L2 후보 승인",
  press_l2_reject: "보도자료 L2 후보 해제",
  dedupe_confirm: "중복 후보 확정",
  dedupe_reject: "중복 후보 해제",
  health_alert_run: "헬스 알림 cron 실행",
  press_l2_auto_revoke: "자동 등록 정책 회수",
  press_l2_auto_restore: "자동 등록 정책 복원",
  cancellation_followup_sent: "해지 사용자 재가입 안내 발송",
  category_backfill_run: "카테고리 자동 보강 cron 실행",
  blog_quality_flag: "블로그 글 검수 필요 표시",
  nps_invite_sent: "NPS 설문 초대 발송",
  sns_publish_run: "SNS 자동 게시 실행",
  cron_retry_run: "Cron 자동 재시도 실행",
  vercel_deploy_failed: "Vercel deploy 실패 알림",
  llm_usage_summary: "LLM 사용량 일일 요약",
  instagram_publish_success: "인스타 자동 발행 성공",
  instagram_publish_fail: "인스타 자동 발행 실패",
  instagram_token_refresh: "인스타 토큰 갱신",
  instagram_publish_skipped: "인스타 발행 cron skip (안전책)",
  instagram_attempt_count_update_failed: "인스타 attempt_count UPDATE 실패 (진단)",
  naver_cookies_uploaded: "네이버 세션 cookies 업로드",
  naver_manual_test: "네이버 RPA 매뉴얼 검증",
  policy_url_check_run: "정책 source URL 404 감지 cron",
  collect_run: "정책 수집 cron 실행",
  press_ingest_run: "press-ingest cron 진입 흔적",
  alert_dispatch_run: "alert-dispatch cron 진입 흔적",
  external_console_check_run: "외부 콘솔 점검 cron 진입 흔적",
  daily_digest_run: "사장님 일일 KPI SMS cron 가동",
  weekly_ops_digest_run: "사장님 주간 운영 보고 cron 가동",
  sentry_daily_summary_run: "Sentry 일일 요약 cron 가동",
  onboarding_reminder_run: "온보딩 reminder cron 가동",
  policy_enrich_run: "정책 키워드/요약 enrich cron 가동",
  weekly_digest_run: "사용자 주간 다이제스트 cron 가동",
  support_reminder_run: "CS 미답변 ticket reminder cron 가동",
  autonomous_improvement_scan_run: "자율 개선 스캔 cron 가동",
  local_press_scrape: "시·군 보도자료 수집",
  local_press_scrape_run: "시·군 보도자료 cron 가동",
  weekly_scrape_monitor_run: "1주 수집 진단 cron",
  popularity_snapshot_run: "popularity 30일 추세 snapshot cron",
  sns_publish_popular_policy_run: "인기 정책 SNS 자동 발행 cron",
  gemini_quota_alert: "Gemini 월 한도 사고 텔레그램 알림",
  press_low_reminder_run: "press low pending 검수 reminder + 90일 archived",
  external_console_alert_sent: "외부 점검 alert 발송 (24h dedupe)",
  naver_news_collect_run: "naver-news 광역 cron 진입 흔적",
  agent_diagnose_run: "Codex agent 사고 진단 호출 (W0)",
  agent_execute_run: "Codex agent 액션 실행 호출 (W1+)",
  adsense_review_state: "AdSense 검수 state 추적 (전환 알림 cron)",
  blog_publish_summary_run: "블로그 24h 발행 누적 텔레그램 cron",
  blog_short_content_alert: "LLM 본문 짧음 사고 자동 감지 (24h cooldown)",
  blog_openai_fallback_alert: "OpenAI 비상 백업 발동 알림 (gpt-4o)",
  adsense_gmail_match: "AdSense Gmail 이메일 자동 파싱 + verdict 분류",
  naver_extension_idle_check: "Naver Extension 1주 미가동 자동 reminder cron",
  security_rotation_done: "사장님 보안 회전 완료 신고",
  render_plan_upgraded: "Render Starter plan 업그레이드 신고",
  toss_billing_approved: "토스 빌링 카드사 심사 통과 신고",
  press_confidence_tune_run: "press tier_floor 자가 진화 학습 (매주 월)",
  popularity_weights_tune_run: "popularity weights 자가 진화 학습 (매주 월)",
  push_send_run: "PWA 푸시 발송 (매시)",
  push_time_learn_run: "PWA 푸시 시점 자가 진화 학습 (매주 월)",
  self_learning_digest_run: "자가 진화 학습 다이제스트 (매주 월)",
  adsense_review_mode_disabled: "AdSense review mode 자동 OFF (Vercel API + redeploy)",
  adsense_deployment_state_resolved: "AdSense Phase B deployment state 텔레그램 알림 완료 (dedup)",
  press_tier_manual_override: "press tier_floor 수동 override (P3 #1)",
  weights_manual_override: "popularity weights 수동 override (P3 #1)",
};
