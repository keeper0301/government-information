-- ============================================================
-- 020: 상세 API 2단계 fetch 타임스탬프 (welfare · loan)
-- ============================================================
-- 배경:
--   기존 collector 는 목록 API 만 호출 → description·benefits 정도만 채움.
--   복지로·온통청년 같은 정부 사이트는 List 외에 Detail API 도 제공하지만
--   호출 안 하고 있었음. Detail API 응답에는 자격요건·선정기준·신청방법·
--   문의처 등 풍부한 필드가 들어있어서 이걸 2차로 불러와 빈 컬럼 채움.
--
-- 017/019 의 last_llm_enriched_at 패턴 재활용:
--   - last_detail_fetched_at : 성공 시 찍음 (7일 cooldown)
--   - last_detail_failed_at  : 실패 시 찍음 (1일 cooldown, 짧게)
--   - 둘 다 NULLS FIRST 인덱스 — 한 번도 안 된 것부터 처리
-- ============================================================

ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS last_detail_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_detail_failed_at timestamptz;

ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS last_detail_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_detail_failed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_welfare_detail_fetched_at
  ON public.welfare_programs (last_detail_fetched_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_detail_fetched_at
  ON public.loan_programs (last_detail_fetched_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_welfare_detail_failed_at
  ON public.welfare_programs (last_detail_failed_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_detail_failed_at
  ON public.loan_programs (last_detail_failed_at NULLS FIRST);

COMMENT ON COLUMN public.welfare_programs.last_detail_fetched_at
  IS 'Detail API 로 상세 필드 채운 시각. 7일 내 중복 처리 방지.';
COMMENT ON COLUMN public.loan_programs.last_detail_fetched_at
  IS 'Detail API 로 상세 필드 채운 시각. 7일 내 중복 처리 방지.';
COMMENT ON COLUMN public.welfare_programs.last_detail_failed_at
  IS 'Detail API 실패 시각. 1일 cooldown.';
COMMENT ON COLUMN public.loan_programs.last_detail_failed_at
  IS 'Detail API 실패 시각. 1일 cooldown.';
