-- 074: dedupe 자동 확정 추적
--
-- dedupe-detect cron 이 score ≥ 0.95 (거의 동일) 페어를 자동 confirm.
-- 사장님 검수 큐에서 자동 빠짐 → 0.7~0.95 (애매한) 페어만 검수 부담.
--
-- 사장님이 자동 confirm 결과를 reject 하면 dedupe_auto_confirmed_at NULL 로 reset
-- → 어드민 큐에 다시 표시됨 (잘못 자동 confirm 된 경우 reverse 가능).

ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS dedupe_auto_confirmed_at timestamptz;

ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS dedupe_auto_confirmed_at timestamptz;

COMMENT ON COLUMN public.welfare_programs.dedupe_auto_confirmed_at IS
  'dedupe-detect cron 이 score ≥ 0.95 로 자동 confirm 한 시각. NULL = 사장님 검수 필요.';
COMMENT ON COLUMN public.loan_programs.dedupe_auto_confirmed_at IS
  'dedupe-detect cron 이 score ≥ 0.95 로 자동 confirm 한 시각. NULL = 사장님 검수 필요.';

-- 어드민 검수 큐 빠른 조회 — 사장님이 보는 페어만 (auto-confirmed 제외)
CREATE INDEX IF NOT EXISTS idx_welfare_dedupe_pending_review
  ON public.welfare_programs(duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL AND dedupe_auto_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loan_dedupe_pending_review
  ON public.loan_programs(duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL AND dedupe_auto_confirmed_at IS NULL;
