-- 089_security_advisor_fix.sql
-- 2026-05-14 — Supabase advisor security ERROR 1건 + WARN 5건 fix.
--
-- dogfood 발견 (a681b12 deploy 후 external-console-check manual trigger):
-- - supabase_advisor_error: 1건 (decision_pending RLS 비활성)
-- - function_search_path_mutable: 2건 (support_tickets_set_updated_at, increment_rate_limit)
-- - anon/authenticated_security_definer_function_executable: 3 함수
--
-- ⚠️ prod apply 사장님 명시 승인 필요 (memory: feedback_prod_ddl_explicit_approval).

-- ─── ERROR 1건 fix: decision_pending RLS 활성 + service_role 전용 정책 ──────
-- 원래 SMS 결정 위임 시스템 (commit 03067be) 이 RLS 가드 누락.
-- anon 도 read/write 가능했음 — 외부 공격자가 사장님 의사결정 주입 가능.
-- service_role (createAdminClient) 만 access 허용 — webhook + admin 만 사용.

ALTER TABLE public.decision_pending ENABLE ROW LEVEL SECURITY;

-- service_role bypass 는 자동 — 명시적 정책 불필요. anon/authenticated 차단 보장 위해
-- 빈 정책만 (SELECT/INSERT/UPDATE/DELETE 모두 false) 추가해 의도 명시.
DROP POLICY IF EXISTS decision_pending_block_anon ON public.decision_pending;
CREATE POLICY decision_pending_block_anon
  ON public.decision_pending
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ─── WARN function_search_path_mutable (2건) fix ──────────────────────────
-- search_path 가 role mutable 이면 권한 escalation risk.
-- 명시적 SET search_path TO 'public' 으로 고정.

ALTER FUNCTION public.support_tickets_set_updated_at()
  SET search_path TO 'public';

ALTER FUNCTION public.increment_rate_limit(p_bucket text, p_window_minute bigint)
  SET search_path TO 'public';

-- ─── WARN anon/authenticated SECURITY DEFINER (3 함수) fix ───────────────
-- increment_rate_limit · increment_view_count · update_instagram_oauth_tokens_updated_at
-- 가 anon/authenticated 로 호출 가능. 의도별 처리:
--
-- 1. update_instagram_oauth_tokens_updated_at — 트리거 함수.
--    REST API 로 호출될 일 없음. anon/authenticated 의 EXECUTE 회수.
REVOKE EXECUTE ON FUNCTION public.update_instagram_oauth_tokens_updated_at()
  FROM anon, authenticated, PUBLIC;
-- service_role (트리거 internal) 는 자동 보유 유지.

-- 2. increment_rate_limit — anon 가 호출해야 정상 (anonymous rate limit).
--    SECURITY INVOKER 로 변환 — 호출자 권한으로 RLS 적용. 하지만 rate_limits 테이블은
--    이미 RLS enabled + policy 0 (overly restrictive) 라 anon INVOKER 가 막힘.
--    안전책: SECURITY DEFINER 유지 + search_path 고정 (위 ALTER FUNCTION) + 호출자
--    검증을 함수 본체에서 처리하도록 의존. Supabase advisor 는 이 함수 사용 패턴을
--    "의도된 익스포즈" 로 다음 점검에서 인지하지 못해 WARN 유지될 수 있음.
--    (이 fix 는 SECURITY DEFINER 유지 — 의도 명시 + 다음 advisor pass 에서 'expected'
--    표시 권장)

-- 3. increment_view_count — view count 증가. anon 호출 의도된 것.
--    same pattern as increment_rate_limit. SECURITY DEFINER 유지.

-- ─── WARN auth_leaked_password_protection 은 Supabase 콘솔 UI 에서만 활성화 가능 ──
-- DDL 로 설정 불가. 사장님이 https://supabase.com/dashboard/project/_/auth/providers
-- → "Leaked password protection" toggle 활성 권장 (HaveIBeenPwned 연동).
