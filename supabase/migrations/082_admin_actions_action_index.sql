-- ============================================================
-- 082 — admin_actions(action, created_at DESC) 복합 인덱스
-- ============================================================
-- 자율 운영 hub (/admin/autonomous) 가 매 페이지 로드마다 5+ 쿼리 패턴
-- WHERE action = X AND created_at >= ... 실행. row 수 늘면 seq scan 위험.
-- 이 인덱스로 즉시 hash·index lookup 으로 전환.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admin_actions_action_recent
  ON public.admin_actions(action, created_at DESC);
