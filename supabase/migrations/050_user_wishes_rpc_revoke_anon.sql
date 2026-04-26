-- ============================================================
-- 050_user_wishes_rpc_revoke_anon — RPC EXECUTE 권한 잠금 hot-fix
-- ============================================================
-- 배경: 049 에서 SECURITY DEFINER 함수 insert_user_wish_with_rate_limit 를
-- 만들면서 `REVOKE ALL ... FROM PUBLIC` + `GRANT ... TO service_role` 만
-- 실행했음. 그런데 Postgres 14+ Supabase 환경에서는 CREATE FUNCTION 시
-- anon / authenticated role 에 EXECUTE 가 default 로 부여되며, PUBLIC 회수는
-- 이 명시적 grant 를 건드리지 않음.
--
-- 결과: anon 사용자가 PostgREST 의 /rest/v1/rpc/insert_user_wish_with_rate_limit
-- 으로 직접 호출해 라우트의 길이검증 + RATE_MAX 가드를 우회 INSERT 가능했음.
-- 047 RLS lockdown 이 의도한 "라우트 가드 강제" 가 깨진 상태.
--
-- 해결: anon, authenticated 에서 EXECUTE 명시 회수. service_role 만 호출 가능.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.insert_user_wish_with_rate_limit(text, text, text, text, int, int)
  FROM PUBLIC, anon, authenticated;

-- service_role 은 049 에서 이미 GRANT 되어 있지만 명시적으로 한번 더 확인.
GRANT EXECUTE ON FUNCTION public.insert_user_wish_with_rate_limit(text, text, text, text, int, int)
  TO service_role;
