-- ============================================================
-- 051_pending_deletions_rls_initplan — RLS 정책 initplan 최적화
-- ============================================================
-- 배경: 024 마이그레이션의 pending_deletions_own_select 정책이
-- `auth.uid() = user_id` 형태로 작성되어 매 row 마다 auth.uid() 함수
-- 재평가. row 수가 늘면 성능 저하 (Supabase advisor auth_rls_initplan WARN).
--
-- 해결: subquery 로 감싸 한 번만 평가되도록 변경.
-- 의미는 동일 (auth.uid() == user_id) — 성능만 개선.
-- ============================================================

DROP POLICY IF EXISTS pending_deletions_own_select ON public.pending_deletions;

CREATE POLICY pending_deletions_own_select ON public.pending_deletions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
