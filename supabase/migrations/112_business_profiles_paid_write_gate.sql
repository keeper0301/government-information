-- 112_business_profiles_paid_write_gate.sql
-- Basic 유료 기능(내 가게 자격 자동 진단) write path 서버 게이트화.
--
-- business_profiles 는 가격표/사업계획상 Basic 이상 유료 기능의 핵심 입력값이다.
-- 기존 RLS 는 본인 인증 사용자라면 무료 사용자도 클라이언트 Supabase 로 직접 upsert 가능했다.
-- 이제 쓰기는 /api/business-profile 이 requireTier(user,'basic') 확인 후 service role 로 수행한다.

REVOKE INSERT, UPDATE, DELETE ON public.business_profiles FROM authenticated;

COMMENT ON TABLE public.business_profiles IS
  '자영업자/소상공인 내 가게 프로필. Basic 이상 유료 기능 입력값이며 쓰기는 /api/business-profile 서버 티어 게이트를 통해서만 허용.';
