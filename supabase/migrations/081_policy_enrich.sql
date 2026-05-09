-- 081: 다 묶음 — 정책 본문 자동 풍부화 (키워드 + 카드 요약)
--
-- LLM 으로 매일 30건씩 자동 채움. 사용자 검색 정확도 + 카드 UX 향상.
-- 컬럼 nullable 이라 미적용 prod / 미채움 row 영향 0.

-- welfare_programs
ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS summary_short TEXT;

-- loan_programs
ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS summary_short TEXT;

-- 키워드 GIN 인덱스 — array 검색 가속 (예: keywords && ARRAY['청년','전세'])
CREATE INDEX IF NOT EXISTS idx_welfare_keywords_gin
  ON public.welfare_programs USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_loan_keywords_gin
  ON public.loan_programs USING GIN (keywords);

COMMENT ON COLUMN public.welfare_programs.keywords IS
  'LLM 자동 추출 키워드 5~15개 (예: ["청년","전세","월세지원","서울"]). 검색 매칭에 활용.';
COMMENT ON COLUMN public.welfare_programs.summary_short IS
  'LLM 자동 한 줄 요약 (30~50자). 카드·목록·OG 텍스트 활용.';
