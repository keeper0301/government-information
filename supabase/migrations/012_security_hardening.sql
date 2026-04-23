-- ============================================================
-- 012: Supabase advisor 에 잡힌 보안 경고 정리
-- ============================================================
-- get_advisors(security) 결과 (2026-04-23):
--   ERROR cron_failure_log  : RLS 미활성 (public schema 노출)
--   INFO  source_fetch_log  : RLS 는 있지만 policy 없음 (service_role 만 쓰는 내부 테이블)
--   WARN  increment_view_count / set_updated_at : search_path mutable
-- ============================================================

-- 운영 전용 내부 테이블에 RLS 활성화 (policy 없음 = 모든 role 차단,
-- service_role 는 어차피 RLS bypass).
ALTER TABLE public.cron_failure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_fetch_log ENABLE ROW LEVEL SECURITY;

-- 함수 search_path 를 'public' 으로 고정 (mutable search_path 주입 방지).
-- 함수 내부가 public.* 참조라 빈 문자열 대신 'public' 이 안전.
ALTER FUNCTION public.increment_view_count(text, uuid) SET search_path = 'public';
ALTER FUNCTION public.set_updated_at() SET search_path = 'public';
