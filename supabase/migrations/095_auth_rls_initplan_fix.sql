-- ============================================================
-- 095: auth_rls_initplan WARN 3건 fix
-- ============================================================
-- Supabase advisor `auth_rls_initplan` 권고:
--   RLS policy 안에서 `auth.uid()` 가 row마다 재평가됨 → 큰 테이블에서 성능 저하.
--   `auth.uid()` → `(SELECT auth.uid())` 로 변경하면 query plan 에서 한 번만 평가.
--
-- 영향:
--   - functional 동일 (같은 row 필터)
--   - performance 향상 (특히 user_events 같은 누적 테이블)
--
-- 변경 3 policy:
--   1. nps_responses.own_nps_select
--   2. support_tickets.own_tickets_select
--   3. user_events.user_events_select_own
-- ============================================================

ALTER POLICY own_nps_select ON public.nps_responses
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY own_tickets_select ON public.support_tickets
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY user_events_select_own ON public.user_events
  USING ((SELECT auth.uid()) = user_id);
