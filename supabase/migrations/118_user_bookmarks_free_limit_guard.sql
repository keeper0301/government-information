-- 118_user_bookmarks_free_limit_guard.sql
-- Enforce the pricing promise "Basic+: unlimited bookmarked policies" at the DB layer.
-- Server action already checks free users at 5 bookmarks, but direct browser
-- Supabase inserts were still allowed by the existing own-row INSERT policy.

CREATE OR REPLACE FUNCTION public.user_has_active_paid_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.tier IN ('basic', 'pro')
      AND s.status <> 'pending'
      AND (
        s.status <> 'cancelled'
        OR COALESCE(s.current_period_end, '-infinity'::timestamptz) >= now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_active_paid_subscription(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_active_paid_subscription(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_active_paid_subscription(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_user_bookmarks_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = '23502';
  END IF;

  IF public.user_has_active_paid_subscription(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO existing_count
  FROM public.user_bookmarks ub
  WHERE ub.user_id = NEW.user_id;

  IF existing_count >= 5 THEN
    RAISE EXCEPTION 'free_bookmark_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_bookmarks_plan_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_user_bookmarks_plan_limit() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_user_bookmarks_plan_limit() TO service_role;

DROP TRIGGER IF EXISTS user_bookmarks_plan_limit_before_insert ON public.user_bookmarks;
CREATE TRIGGER user_bookmarks_plan_limit_before_insert
  BEFORE INSERT ON public.user_bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_bookmarks_plan_limit();

COMMENT ON FUNCTION public.enforce_user_bookmarks_plan_limit() IS
  '무료 사용자는 관심 정책 5건까지만 저장. Basic/Pro 유효 구독자는 무제한. 클라이언트 직접 insert 우회 방어.';
COMMENT ON TABLE public.user_bookmarks IS
  '사용자 북마크 (찜한 정책). 무료 5건 제한은 enforce_user_bookmarks_plan_limit trigger 로 DB 계층에서도 강제.';
