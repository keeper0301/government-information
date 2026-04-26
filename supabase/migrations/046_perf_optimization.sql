-- ================================================================
-- 046_perf_optimization
-- ================================================================
-- 2026-04-26 504 사고 후 Performance Advisor 진단 결과 적용.
-- Disk IO Budget 고갈 원인 정리:
-- 1) user_bookmarks RLS auth.uid() 매 row 평가 (3 policy)
-- 2) loan_programs/welfare_programs duplicate_of_id FK 인덱스 누락
-- 3) Phase 1/1.5 도입 후 사용 안 되는 인덱스 27개
--
-- 적용 결과: Warnings 3 → 0, Info 30 → 3 (90% 감소)
-- memory: project_svg_map_504_incident_2026_04_26.md
-- ================================================================

-- 1) RLS policy 재작성 — (SELECT auth.uid()) 1회 평가 패턴
DROP POLICY IF EXISTS user_bookmarks_select_own ON public.user_bookmarks;
CREATE POLICY user_bookmarks_select_own
  ON public.user_bookmarks
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_bookmarks_insert_own ON public.user_bookmarks;
CREATE POLICY user_bookmarks_insert_own
  ON public.user_bookmarks
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_bookmarks_delete_own ON public.user_bookmarks;
CREATE POLICY user_bookmarks_delete_own
  ON public.user_bookmarks
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 2) Unindexed FK — covering index 추가 (정책 11,755건 테이블의 duplicate detection JOIN)
CREATE INDEX IF NOT EXISTS idx_loan_duplicate_of_id
  ON public.loan_programs (duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_welfare_duplicate_of_id
  ON public.welfare_programs (duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL;

-- 3) Unused index 27개 삭제 (Phase 1/1.5 도입 후 한 번도 안 쓰임)
DROP INDEX IF EXISTS public.idx_blog_posts_category_published;
DROP INDEX IF EXISTS public.idx_blog_posts_source;
DROP INDEX IF EXISTS public.cron_failure_log_last_seen;
DROP INDEX IF EXISTS public.idx_user_profiles_benefit_tags;
DROP INDEX IF EXISTS public.idx_user_profiles_household_types;
DROP INDEX IF EXISTS public.idx_subscriptions_trial_ends;
DROP INDEX IF EXISTS public.idx_subscriptions_period_end;
DROP INDEX IF EXISTS public.idx_payment_order;
DROP INDEX IF EXISTS public.idx_alert_rules_user;
DROP INDEX IF EXISTS public.idx_news_benefit_tags_gin;
DROP INDEX IF EXISTS public.idx_user_wishes_created_at;
DROP INDEX IF EXISTS public.idx_welfare_region_tags;
DROP INDEX IF EXISTS public.idx_welfare_age_tags;
DROP INDEX IF EXISTS public.idx_welfare_occupation_tags;
DROP INDEX IF EXISTS public.idx_welfare_benefit_tags;
DROP INDEX IF EXISTS public.idx_welfare_household_tags;
DROP INDEX IF EXISTS public.idx_welfare_llm_enriched_at;
DROP INDEX IF EXISTS public.idx_welfare_household_target;
DROP INDEX IF EXISTS public.idx_loan_published_desc;
DROP INDEX IF EXISTS public.idx_loan_region_tags;
DROP INDEX IF EXISTS public.idx_loan_age_tags;
DROP INDEX IF EXISTS public.idx_loan_occupation_tags;
DROP INDEX IF EXISTS public.idx_loan_benefit_tags;
DROP INDEX IF EXISTS public.idx_loan_household_tags;
DROP INDEX IF EXISTS public.idx_loan_llm_enriched_at;
DROP INDEX IF EXISTS public.idx_loan_household_target;
DROP INDEX IF EXISTS public.idx_user_bookmarks_user_created;
