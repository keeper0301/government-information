-- ============================================================
-- 019: LLM 보강 실패 타임스탬프 (welfare · loan)
-- ============================================================
-- 기존 017 (last_llm_enriched_at) 은 성공/실패 모두 같은 컬럼에 찍어서
-- 일시적 Gemini 실패 (네트워크·rate limit·모델 글리치) 도 7일간 잠금.
--
-- 이 마이그레이션으로 실패 전용 타임스탬프 컬럼을 분리해:
--   - last_llm_enriched_at  : 성공 시에만 찍음 (7일 cooldown 대상)
--   - last_llm_failed_at    : 실패 시에만 찍음 (1일 cooldown 대상, 짧게)
--
-- 후보 조회:
--   (last_llm_enriched_at IS NULL OR < 7일전)  -- 성공 쿨다운
--   AND (last_llm_failed_at IS NULL OR < 1일전) -- 실패 쿨다운
--
-- 효과: 일시적 실패는 하루만 대기 → 복구 빠름.
-- 영구 실패(description 내용 부족 등) 도 하루 반복되지만 limit 10 이라
-- rate limit 낭비는 소폭. 더 정교한 억제는 retry_count 등으로 Phase 3+.
-- ============================================================

ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS last_llm_failed_at timestamptz;

ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS last_llm_failed_at timestamptz;

-- 실패 cooldown 조회 최적화 — NULL 우선 + 오래된 순
CREATE INDEX IF NOT EXISTS idx_welfare_llm_failed_at
  ON public.welfare_programs (last_llm_failed_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_llm_failed_at
  ON public.loan_programs (last_llm_failed_at NULLS FIRST);

COMMENT ON COLUMN public.welfare_programs.last_llm_failed_at
  IS 'Gemini 보강 실패 시각. 1일 cooldown (일시 오류 빠른 복구).';
COMMENT ON COLUMN public.loan_programs.last_llm_failed_at
  IS 'Gemini 보강 실패 시각. 1일 cooldown (일시 오류 빠른 복구).';
