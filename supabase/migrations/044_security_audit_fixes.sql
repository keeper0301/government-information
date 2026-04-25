-- supabase/migrations/044_security_audit_fixes.sql
-- 2026-04-26 운영 감사 결과 즉시 수정
--
-- 1. ERROR: user_latest_consent 뷰 SECURITY DEFINER 제거
--    → 뷰 사용자가 자신의 권한으로 쿼리하도록 변경 (RLS 정상 동작)
-- 2. WARN: news_posts 중복 인덱스 제거 (021/031 에서 동일 GIN 인덱스 두 번 생성)
-- 3. WARN: 7개 함수 search_path = public 고정
--    → 검색 경로 조작을 통한 권한 상승 방지

-- ============================================================
-- 1. 뷰 재생성 (SECURITY INVOKER 가 기본값)
-- ============================================================
DROP VIEW IF EXISTS public.user_latest_consent;

CREATE VIEW public.user_latest_consent
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (user_id, consent_type)
  user_id,
  consent_type,
  version,
  consented_at,
  withdrawn_at,
  withdrawn_at IS NULL AS is_active
FROM consent_log
ORDER BY user_id, consent_type, consented_at DESC;

COMMENT ON VIEW public.user_latest_consent IS
  '사용자별 최신 동의 상태. SECURITY INVOKER (호출자 권한·RLS 적용).';

-- ============================================================
-- 2. 중복 인덱스 제거 (idx_news_benefit_tags_gin 유지, 021 에서 먼저 생성)
-- ============================================================
DROP INDEX IF EXISTS public.news_posts_benefit_tags_idx;

-- ============================================================
-- 3. 함수 search_path 고정
-- ============================================================
ALTER FUNCTION public.normalize_program_category() SET search_path = public;
ALTER FUNCTION public.normalize_program_category_value(text) SET search_path = public;
ALTER FUNCTION public.welfare_category_counts() SET search_path = public;
ALTER FUNCTION public.loan_category_counts() SET search_path = public;
ALTER FUNCTION public.news_benefit_tag_counts() SET search_path = public;
ALTER FUNCTION public.blog_category_counts() SET search_path = public;
ALTER FUNCTION public.normalize_interests_to_benefit_tags() SET search_path = public;
