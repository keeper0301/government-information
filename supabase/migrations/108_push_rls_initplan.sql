-- 108 auth_rls_initplan 성능 WARN 해소 — RLS 정책 auth.uid() per-row 재평가 방지
-- ============================================================
-- advisor performance WARN(auth_rls_initplan): push_notification_log·push_user_preferences 의
-- RLS 정책이 auth.uid() 를 행마다 재평가 → 대규모 스캔 시 성능 저하.
-- (select auth.uid()) 로 감싸면 PostgreSQL 이 쿼리당 1회만 평가(initplan)해 캐싱.
-- 정책 로직은 동일("본인 user_id 행만") → 회귀 0. 성능만 개선.
-- 참고: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ============================================================

ALTER POLICY "push_log_user_select" ON public.push_notification_log
  USING ((select auth.uid()) = user_id);

ALTER POLICY "push_pref_user_select" ON public.push_user_preferences
  USING ((select auth.uid()) = user_id);

ALTER POLICY "push_pref_user_update" ON public.push_user_preferences
  USING ((select auth.uid()) = user_id);
