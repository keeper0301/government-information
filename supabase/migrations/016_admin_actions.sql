-- ============================================================
-- 016: 관리자 액션 감사 로그 (admin_actions)
-- ============================================================
-- 어드민이 사용자 데이터에 수행한 작업을 감사 추적.
-- "누가 언제 누구에게 어떤 액션을 했는지" 기록.
--
-- 용도:
--   - 운영 투명성 (사장님 본인 기억 돕기 + 법적 분쟁 대비)
--   - 디버깅 ("이 사용자 AI 쿼터가 왜 리셋됐지?" 추적)
--   - 어드민이 여러 명으로 늘어날 경우 행동 로그
--
-- 액션 종류 (action 컬럼 값):
--   reset_ai_quota     : 오늘 AI 사용 카운트 0 초기화
--   manual_delete_user : 어드민이 수동으로 사용자 탈퇴 처리 (Phase 2)
--   update_tier        : 구독 티어 수동 변경 (Phase 2)
--   manual_alert_send  : 수동 알림 재전송 (Phase 2)
--
-- 설계:
--   - actor_id : 액션 수행자. user 삭제돼도 감사 로그는 유지 (SET NULL)
--   - target_user_id : 액션 대상. 대상 user 삭제돼도 로그는 유지 (SET NULL)
--   - details : JSONB 로 액션별 컨텍스트 (날짜·이유·이전값 등 자유 기록)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 액션 수행한 관리자 user_id
  -- user 삭제 시 NULL (감사 로그 자체는 영구 보존)
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 액션 대상 사용자 user_id
  -- 대상 user 삭제 시 NULL (예: 수동 탈퇴 처리한 로그는 남아야 함)
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 액션 종류 — 코드에서 enum 으로 관리, DB 제약은 없음 (확장성 우선)
  action TEXT NOT NULL,

  -- 추가 컨텍스트 (JSON). 예:
  --   reset_ai_quota     : { "date": "2026-04-25" }
  --   manual_delete_user : { "reason": "사용자 문의", "email": "x@y.com" }
  --   update_tier        : { "from": "free", "to": "basic", "reason": "수동 부여" }
  details JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_actions IS
  '관리자 액션 감사 로그. actor/target user 삭제돼도 로그는 유지 (ON DELETE SET NULL).';

-- ━━━ 인덱스 ━━━
-- 특정 사용자의 최근 관리 액션 이력 조회 (/admin/users/[userId] 감사 로그 Panel)
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_recent
  ON public.admin_actions(target_user_id, created_at DESC);

-- 특정 어드민의 최근 수행 이력 (추후 /admin/my-actions 등)
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor_recent
  ON public.admin_actions(actor_id, created_at DESC);

-- ━━━ RLS ━━━
-- 감사 로그는 클라이언트 직접 조회 금지. 서버(service_role) 만 접근.
-- 어드민 페이지는 서버 컴포넌트에서 createAdminClient 로 조회.
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- 정책 없음 = 모든 anon/authenticated 접근 차단. service_role 은 RLS 우회라 OK.
