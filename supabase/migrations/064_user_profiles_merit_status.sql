-- ============================================================
-- 064: user_profiles.merit_status — 보훈 가족 시그널
-- ============================================================
-- 배경:
--   2026-04-28 사장님 화면 사고 후속. NATIONAL_MERIT_COHORT_KEYWORDS
--   게이트가 모든 일반 사용자 차단했지만, 실제 보훈 가족이 가입할 때
--   보훈 정책을 못 보는 문제 잔존.
--
-- 컬럼:
--   merit_status text NULL — 보훈 가족 여부 단순 시그널
--                            NULL  = 미입력 (보수적 — 차단)
--                            merit = 본인/유족 (NATIONAL_MERIT 게이트 통과)
--                            none  = 해당 없음 (차단)
--
-- 부작용 없음:
--   - 단순 컬럼 추가, 기존 인덱스·RLS 영향 없음.
--   - 기존 사용자 모두 NULL 로 입력됨 → score.ts NATIONAL_MERIT 게이트
--     동작 변화 0 (회귀 0).
--   - 신규 사용자가 마이페이지에서 'merit' 선택 시 보훈 정책 노출 가능.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS merit_status text;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_merit_status_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_merit_status_check
  CHECK (merit_status IS NULL OR merit_status IN ('merit', 'none'));

COMMENT ON COLUMN public.user_profiles.merit_status IS
  '보훈 가족 여부 (NATIONAL_MERIT cohort 매칭). NULL=미입력→차단, merit=본인/유족→통과, none=해당없음→차단';
