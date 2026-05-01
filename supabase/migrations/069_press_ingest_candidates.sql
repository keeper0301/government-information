-- 069: 광역 보도자료 L2 분류 confirm 후보 큐
--
-- LLM 이 welfare/loan 에 바로 INSERT 하지 않고, 사장님 confirm 전 단계에
-- 분류 결과를 보관한다. news_id UNIQUE 로 같은 보도자료 반복 분류 비용을 막고,
-- confirm/reject 감사 상태를 테이블에 남긴다.

CREATE TABLE IF NOT EXISTS public.press_ingest_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'skipped', 'failed')),
  program_type text NOT NULL DEFAULT 'unsure'
    CHECK (program_type IN ('welfare', 'loan', 'unsure', 'not_policy')),

  title text NOT NULL,
  category text,
  classified_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  skip_reason text,
  error_message text,
  classified_at timestamptz NOT NULL DEFAULT now(),

  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_program_table text
    CHECK (confirmed_program_table IS NULL OR confirmed_program_table IN ('welfare_programs', 'loan_programs')),
  confirmed_program_id uuid,

  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT press_ingest_candidates_news_uniq UNIQUE (news_id)
);

CREATE INDEX IF NOT EXISTS idx_press_ingest_candidates_status_recent
  ON public.press_ingest_candidates(status, classified_at DESC);

CREATE INDEX IF NOT EXISTS idx_press_ingest_candidates_program_type
  ON public.press_ingest_candidates(program_type, classified_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.press_ingest_candidates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.press_ingest_candidates IS
  '광역 보도자료 L2 LLM 분류 결과 confirm 후보 큐. service_role 서버 경로에서만 접근.';
COMMENT ON COLUMN public.press_ingest_candidates.classified_payload IS
  'ClassifyResult JSON 원본. confirm 시 welfare/loan INSERT payload 로 변환한다.';
