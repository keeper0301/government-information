-- 107 SECURITY DEFINER 함수 anon/authenticated EXECUTE revoke
-- ============================================================
-- advisor WARN(anon/authenticated_security_definer_function_executable) 해소.
-- 두 함수는 SECURITY DEFINER(RLS 우회)인데 anon/authenticated 가 /rest/v1/rpc/ 로 직접 호출
-- 가능했음 → 브라우저에서 임의 호출(조회수 부풀림→추천 왜곡, rate_limit 조작) 위험.
--
-- 실제 호출처는 모두 service_role(RLS·EXECUTE 우회):
--   - increment_rate_limit  : lib/support/rate-limit.ts (createAdminClient)
--   - increment_view_count  : app/{loan,welfare,news}/[id|slug]/page.tsx (createAdminClient)
--     (loan·welfare 는 이번에 anon→admin 전환, news 는 기존부터 admin)
-- → anon/authenticated EXECUTE 회수해도 회귀 0. service_role 호출은 그대로 동작.
-- ※ 059·089 에서 "anon 호출 의도 → SECURITY DEFINER 유지"로 판단했으나, 실제 호출처가 전부
--   service_role(createAdminClient)임이 확인되어 본 마이그에서 번복(anon EXECUTE 최종 차단).
-- ============================================================

-- ⚠️ 함수 EXECUTE 는 생성 시 PUBLIC 에 기본 grant 됨 → FROM anon/authenticated 만 revoke 하면
-- PUBLIC 경로로 여전히 실행 가능(advisor WARN 잔존). PUBLIC 회수 + service_role 만 명시 grant.
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_view_count(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_view_count(text, uuid) TO service_role;
