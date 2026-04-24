-- ============================================================
-- 017: LLM 보강 타임스탬프 (welfare · loan)
-- ============================================================
-- /api/enrich-llm 이 description 에서 Gemini 로 구조화 필드를 추출하며,
-- 같은 공고를 7일 이내 중복 처리하지 않도록 이 컬럼을 기준으로 후보 선별.
--
-- 기존 /api/enrich 는 data.go.kr 공식 API 전용 (welfare 만, serv_id 있는 것만).
-- /api/enrich-llm 은 그 외 소스(대출 15종 포함) 의 description 에서 LLM 으로
-- eligibility · benefits · loan_amount · interest_rate · apply_method 등 추출.
-- ============================================================

ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS last_llm_enriched_at timestamptz;

ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS last_llm_enriched_at timestamptz;

-- 후보 조회 최적화: NULL 우선 + 오래된 순
-- (한 번도 보강 안 한 것을 가장 먼저, 그 다음 오래된 순으로 처리)
CREATE INDEX IF NOT EXISTS idx_welfare_llm_enriched_at
  ON public.welfare_programs (last_llm_enriched_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_llm_enriched_at
  ON public.loan_programs (last_llm_enriched_at NULLS FIRST);

COMMENT ON COLUMN public.welfare_programs.last_llm_enriched_at
  IS 'Gemini 기반 /api/enrich-llm 으로 구조화 필드 추출한 시각. 7일 내 중복 처리 방지.';
COMMENT ON COLUMN public.loan_programs.last_llm_enriched_at
  IS 'Gemini 기반 /api/enrich-llm 으로 구조화 필드 추출한 시각. 7일 내 중복 처리 방지.';
