-- 080: C3 — NPS 자동 수집 (가입 7일 후 설문)
--
-- 가입 7~8일 사용자에게 자동 메일 (점수 1~5 link). 응답은 /api/nps/submit
-- token 인증으로 anonymous 가능. weekly-ops digest 에 평균 점수 통합.

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 1 (매우 불만족) ~ 5 (매우 만족). 단순 5단 스케일.
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 사용자당 1번만 (중복 응답 차단)
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_recent
  ON public.nps_responses(created_at DESC);

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

-- 본인 응답만 조회. INSERT/UPDATE 는 admin client (endpoint).
CREATE POLICY "own_nps_select" ON public.nps_responses
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.nps_responses IS
  'C3 — 사용자 만족도 NPS 응답. 가입 7d 후 자동 메일 + 1회 응답. weekly-ops 평균 통합.';
