-- ============================================================
-- 013: RLS policy 의 auth.uid() 를 (select auth.uid()) 로 교체
-- ============================================================
-- advisor(performance) 의 auth_rls_initplan WARN 9건 해소.
--
-- 기존 패턴 `auth.uid() = user_id` 는 PostgreSQL 이 매 row 마다 함수 호출
-- → row 수 많을 때 suboptimal. `(select auth.uid()) = user_id` 로 바꾸면
-- 쿼리 계획이 initPlan 으로 최적화돼 한 번만 평가.
--
-- 정책 내용(조건·cmd·대상) 은 동일. 성능만 개선.
-- ============================================================

-- alarm_subscriptions
DROP POLICY IF EXISTS alarm_own_read ON public.alarm_subscriptions;
CREATE POLICY alarm_own_read ON public.alarm_subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS alarm_own_insert ON public.alarm_subscriptions;
CREATE POLICY alarm_own_insert ON public.alarm_subscriptions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS alarm_own_delete ON public.alarm_subscriptions;
CREATE POLICY alarm_own_delete ON public.alarm_subscriptions
  FOR DELETE USING ((select auth.uid()) = user_id);

-- alert_deliveries
DROP POLICY IF EXISTS alert_deliveries_own_read ON public.alert_deliveries;
CREATE POLICY alert_deliveries_own_read ON public.alert_deliveries
  FOR SELECT USING ((select auth.uid()) = user_id);

-- payment_history
DROP POLICY IF EXISTS payment_own_read ON public.payment_history;
CREATE POLICY payment_own_read ON public.payment_history
  FOR SELECT USING ((select auth.uid()) = user_id);

-- subscriptions
DROP POLICY IF EXISTS subscription_own_read ON public.subscriptions;
CREATE POLICY subscription_own_read ON public.subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);

-- user_alert_rules
DROP POLICY IF EXISTS alert_rules_own_all ON public.user_alert_rules;
CREATE POLICY alert_rules_own_all ON public.user_alert_rules
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_profiles
DROP POLICY IF EXISTS profile_own_read ON public.user_profiles;
CREATE POLICY profile_own_read ON public.user_profiles
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profile_own_update ON public.user_profiles;
CREATE POLICY profile_own_update ON public.user_profiles
  FOR UPDATE USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profile_own_upsert ON public.user_profiles;
CREATE POLICY profile_own_upsert ON public.user_profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);
