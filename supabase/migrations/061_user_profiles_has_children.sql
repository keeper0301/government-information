-- ============================================================
-- 061: user_profiles.has_children — 자녀 유무 시그널
-- ============================================================
-- 배경:
--   사장님(전남 순천시 / married / mid) 화면에 산후조리비용 정책이 노출.
--   benefit_tags=[양육,의료,금융] 일치만으로 minScore 통과 → 사장님 직접 제보.
--
--   산후조리·영유아 정책은 본인이 산모/임산부이거나 자녀 동반 가구만 의미.
--   기존 household_types=[married] 만으로는 "자녀 있음" 시그널 부족.
--
-- 컬럼:
--   has_children boolean NULL — 자녀 유무 단순 시그널.
--                                NULL=미입력 (보수적 — 게이트 미적용)
--                                true =자녀 있음
--                                false=없음 → 산후조리·영유아 cohort 차단
--
-- 부작용 없음:
--   - 단순 컬럼 추가, 기존 인덱스·RLS 영향 없음.
--   - score.ts cohort gate 가 이 컬럼 NULL 일 때 게이트 미적용 → 회귀 0.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS has_children boolean;

COMMENT ON COLUMN public.user_profiles.has_children IS
  '자녀 유무 (산후조리·아동지원 cohort 매칭). NULL=미입력, true=자녀 있음, false=없음.';
