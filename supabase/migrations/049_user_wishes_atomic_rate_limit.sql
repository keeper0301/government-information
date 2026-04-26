-- ============================================================
-- 049_user_wishes_atomic_rate_limit — INSERT + rate limit 을 단일 트랜잭션으로
-- ============================================================
-- 배경: /api/wishes 의 기존 패턴은 SELECT count → INSERT 두 단계라 TOCTOU race
-- 가능. 동시 요청이면 RATE_MAX(2/분) 를 약간 초과해 INSERT 됨.
-- 영향은 미미하지만 코드리뷰 후속 정리 (사장님 A 선택, INFORMATIONAL #1).
--
-- 해결: SECURITY DEFINER 함수로 wrap. 같은 트랜잭션 안에서 count → INSERT 라
-- read committed 격리 수준에서도 race window 가 SQL 1개 실행 시간 (수 ms)
-- 으로 축소. 추가로 PG advisory lock 이나 SERIALIZABLE 까지 가지는 않음
-- (분당 2회 제한 1~2건 초과는 운영상 무해).
--
-- search_path 명시 + SECURITY DEFINER 로 권한 에스컬레이션 차단.
-- 반환값: 신규 row id (UUID) 또는 NULL (rate limit 초과 → 호출자가 429 응답).
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_user_wish_with_rate_limit(
  p_ip_hash text,
  p_wish text,
  p_email text,
  p_user_agent text,
  p_window_sec int DEFAULT 60,
  p_max_count int DEFAULT 2
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count int;
BEGIN
  -- 동일 ip_hash 의 윈도우 내 INSERT 카운트
  SELECT COUNT(*)::int INTO v_count
  FROM public.user_wishes
  WHERE ip_hash = p_ip_hash
    AND created_at >= NOW() - (p_window_sec || ' seconds')::interval;

  IF v_count >= p_max_count THEN
    RETURN NULL;  -- rate limit 초과 → 호출자가 429 응답
  END IF;

  INSERT INTO public.user_wishes (wish, email, ip_hash, user_agent)
  VALUES (p_wish, p_email, p_ip_hash, p_user_agent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- service_role 만 호출 가능 (anon/authenticated 차단)
REVOKE ALL ON FUNCTION public.insert_user_wish_with_rate_limit(text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_user_wish_with_rate_limit(text, text, text, text, int, int) TO service_role;
