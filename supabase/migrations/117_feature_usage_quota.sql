-- 117_feature_usage_quota.sql
-- Generic daily feature quota ledger for paid-plan promises.
-- Replaces AI-only quota storage with feature-scoped counters so free recommend
-- and free/basic AI 상담 limits do not consume the same daily bucket.

CREATE TABLE IF NOT EXISTS public.feature_usage_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('ai_chat', 'recommend')),
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, date)
);

COMMENT ON TABLE public.feature_usage_log IS
  '기능별 일일 사용량 추적. ai_chat: 무료/베이직 5회/일, recommend: 무료 5회/일. 유료 무제한 티어는 카운터 미증가.';
COMMENT ON COLUMN public.feature_usage_log.feature IS
  '사용량 제한 대상 기능. ai_chat 또는 recommend.';

CREATE OR REPLACE FUNCTION public.increment_feature_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_feature NOT IN ('ai_chat', 'recommend') THEN
    RAISE EXCEPTION 'invalid feature: %', p_feature USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feature_usage_log (user_id, feature, date, count, updated_at)
  VALUES (p_user_id, p_feature, p_date, 1, now())
  ON CONFLICT (user_id, feature, date) DO UPDATE
    SET count = public.feature_usage_log.count + 1,
        updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) TO service_role;

ALTER TABLE public.feature_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_usage_self_select ON public.feature_usage_log;
CREATE POLICY feature_usage_self_select ON public.feature_usage_log
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Backfill today's AI counts if the legacy table exists. Historical days stay in
-- ai_usage_log for audit; runtime uses feature_usage_log after this migration.
INSERT INTO public.feature_usage_log (user_id, feature, date, count, updated_at)
SELECT user_id, 'ai_chat', date, count, updated_at
FROM public.ai_usage_log
ON CONFLICT (user_id, feature, date) DO UPDATE
  SET count = GREATEST(public.feature_usage_log.count, EXCLUDED.count),
      updated_at = GREATEST(public.feature_usage_log.updated_at, EXCLUDED.updated_at);
