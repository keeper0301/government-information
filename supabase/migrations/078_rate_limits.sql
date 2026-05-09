-- 078: Phase 4-B rate limit 인프라
--
-- 익명 사용자 1분 5회 / 로그인 사용자 1분 30회 같은 분당 호출 제한.
-- /api/support/submit 가 첫 호출 처. 향후 다른 endpoint 도 재사용 가능.
-- fixed window — bucket(요청 식별자) + window_minute(epoch 60초 round) 으로 카운트.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket text NOT NULL,
  window_minute bigint NOT NULL,
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_minute)
);

-- 1시간 전 row 정리용 인덱스 (cleanup cron 또는 vacuum)
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.rate_limits (window_minute);

-- ─── atomic increment RPC ───────────────────────────────────
-- PostgREST 가 native UPSERT atomic increment 어려워서 별도 함수.
-- ON CONFLICT DO UPDATE 로 race condition 안전.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_bucket text,
  p_window_minute bigint
)
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.rate_limits (bucket, window_minute, count)
  VALUES (p_bucket, p_window_minute, 1)
  ON CONFLICT (bucket, window_minute)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS — service_role 만 접근 (admin client 만 호출).
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limits IS
  '분당 호출 제한 카운터 — bucket+window_minute 으로 fixed window 카운트. service_role 만 접근.';
COMMENT ON FUNCTION public.increment_rate_limit IS
  'atomic UPSERT increment — race condition 안전. SECURITY DEFINER 라 RLS 무시.';
