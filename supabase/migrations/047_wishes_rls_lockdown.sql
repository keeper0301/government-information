-- ============================================================
-- 047_wishes_rls_lockdown — user_wishes anon/auth INSERT 정책 제거
-- ============================================================
-- 배경: Supabase advisor 가 user_wishes 의 INSERT 정책 2종이
-- WITH CHECK (true) 로 사실상 RLS bypass 라고 WARN.
--
-- 위험: 악성 클라이언트가 PostgREST 로 직접 INSERT 호출하면
-- /api/wishes 의 길이 검증·rate limit 가드를 우회해
-- DB 비대화·스팸 무제한 적재 가능.
--
-- 해결: anon/auth INSERT 정책을 모두 제거.
-- /api/wishes 는 이미 admin client (service_role) 로 INSERT 하도록 전환됨.
-- service_role 은 RLS 자체를 bypass 하므로 정책 없이도 INSERT 가능.
--
-- 효과: 외부에서 user_wishes 에 직접 쓸 방법이 사라짐.
-- 반드시 /api/wishes 라우트를 거쳐야 INSERT 됨 → 가드 우회 불가.
-- ============================================================

DROP POLICY IF EXISTS anon_can_insert_wish ON public.user_wishes;
DROP POLICY IF EXISTS auth_can_insert_wish ON public.user_wishes;

-- 정책 없는 채로 RLS 활성. service_role 만 bypass 로 접근.
-- (어드민 SELECT 도 admin client 로 이미 동작 중)
ALTER TABLE public.user_wishes ENABLE ROW LEVEL SECURITY;
