-- ============================================================
-- 024: pending_deletions — 30일 유예 soft delete
-- ============================================================
-- 목적:
--   · 사용자가 탈퇴 요청해도 30일간 auth.users 는 보존 → 실수 복구 기회
--   · 30일 경과 시 cron 이 실제 auth.admin.deleteUser 실행 (별도 엔드포인트)
--
-- 동작:
--   1) /api/account/delete 호출 → 이 테이블에 row insert + signOut (즉시 삭제 X)
--   2) 사용자가 30일 내 로그인 시 middleware 가 /account/restore 로 리다이렉트
--   3) 복구: /api/account/restore → 이 테이블에서 row 삭제
--   4) 즉시 최종 삭제: /api/account/delete 재호출하되 { final: true } 전달
--      (복구 페이지의 "지금 영구 삭제" 버튼)
--   5) cron /api/finalize-deletions → scheduled_delete_at 지난 row 를
--      auth.admin.deleteUser 로 실제 삭제 (CASCADE 로 이 테이블 row 도 함께 삭제)
--
-- 감사 로그:
--   · self_delete_requested (insert 시점)
--   · self_delete_restored (row 삭제 시점 — 복구)
--   · self_deleted (cron 이 최종 삭제 완료 시점)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pending_deletions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 복구 화면에서 사용자가 본인 확인용으로 보게 되는 이메일 (평문).
  -- admin_actions 에는 마스킹된 email_masked 가 별도로 저장되어 이중 보존.
  email text NOT NULL,

  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_delete_at timestamptz NOT NULL,

  -- WithdrawSection 의 라디오 선택값 + 자유 입력 (감사 로그와 일관성 위해 그대로 보존).
  -- cron 으로 최종 삭제 시점에 admin_actions 의 self_deleted details 로 옮겨짐.
  reason text,
  reason_detail text,

  CONSTRAINT pending_deletions_schedule_future
    CHECK (scheduled_delete_at > requested_at)
);

-- cron 이 "지나간 entries" 를 빠르게 찾을 수 있도록 scheduled_delete_at 인덱스
CREATE INDEX IF NOT EXISTS idx_pending_deletions_scheduled
  ON public.pending_deletions (scheduled_delete_at);

-- RLS: 본인만 자기 pending 상태 SELECT 가능 (복구 화면). INSERT/UPDATE/DELETE 는 service_role 만.
ALTER TABLE public.pending_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_deletions_own_select ON public.pending_deletions;
CREATE POLICY pending_deletions_own_select ON public.pending_deletions
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.pending_deletions IS
  '30일 유예 soft delete 요청 대기열. 30일 후 cron 이 auth.admin.deleteUser 로 실제 삭제.';
COMMENT ON COLUMN public.pending_deletions.email IS
  '복구 화면 본인 확인용 평문 이메일. 최종 삭제 시 admin_actions.self_deleted 에는 마스킹해 옮김.';
