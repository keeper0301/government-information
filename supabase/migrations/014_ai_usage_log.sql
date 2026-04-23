-- ============================================================
-- 014: AI 정책 상담 일일 사용량 추적
-- ============================================================
-- 가격표 약속 — 무료/베이직: 5회/일, 프로: 무제한.
-- 기존에는 약속만 있고 제한 로직이 없었음 (사실상 모두 무제한).
-- 이 마이그레이션부터 실제 카운터로 강제.
--
-- 설계 결정 (CEO 리뷰 Q4):
--   - DB 장애 시 Fail-open (호출 허용 + 경고 로그) — Codex 검토 후 채택
--   - 채팅 신뢰가 비용 폭주 위험보다 우선
--
-- 동시 호출 (race condition) 방어:
--   - PRIMARY KEY (user_id, date) + INSERT ... ON CONFLICT DO UPDATE
--   - increment_ai_usage(user_id, date) RPC 로 atomic 보장
--   - 같은 사용자가 두 탭에서 동시에 호출해도 중복 증가 없음
-- ============================================================

-- ━━━ 사용량 로그 테이블 ━━━
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 한국 시간(KST) 기준 날짜. 클라이언트가 보낸 값이 아닌 서버 NOW() 기반.
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

COMMENT ON TABLE public.ai_usage_log IS
  'AI 정책 상담 일일 사용량 추적. 무료/베이직 5회/일 강제. 프로는 카운터 안 올림.';

-- ━━━ Atomic increment RPC ━━━
-- INSERT ... ON CONFLICT DO UPDATE 로 race condition 없이 +1 증가
-- RETURNING 으로 새 카운트 반환 → 호출자가 limit 비교
-- security definer + service_role 만 EXECUTE → 클라이언트 직접 호출 차단
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO public.ai_usage_log (user_id, date, count, updated_at)
  VALUES (p_user_id, p_date, 1, now())
  ON CONFLICT (user_id, date) DO UPDATE
    SET count = public.ai_usage_log.count + 1,
        updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ai_usage(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(UUID, DATE) TO service_role;

-- ━━━ RLS ━━━
-- 사용자 본인 카운터만 조회 가능. INSERT/UPDATE 정책 없음 → 클라이언트는
-- 직접 쓰기 불가. 서버(service_role)가 RPC 통해서만 증가.
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_self_select ON public.ai_usage_log;
CREATE POLICY ai_usage_self_select ON public.ai_usage_log
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ━━━ 청소 (옵션, 추후) ━━━
-- 30일 지난 행은 별도 cron 으로 삭제 예정. 지금은 누적 보존.
-- 사용자당 하루 1행이라 3년 누적해도 ~1000 행/사용자 → 청소 시급성 낮음.
