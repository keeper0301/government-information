-- 055_business_profiles.sql
-- 자영업자/소상공인 "내 가게" 프로필 — 자격 진단 wedge (Basic 핵심)
--
-- 사용자가 1회 입력하면 모든 정책에 대해 자격 ✓/✗ 자동 판정.
-- "매출 5억 이하" / "상시근로자 10인 미만" / "소상공인" 같은 정책 자격
-- 키워드와 사용자 사업장 정보를 매칭.
--
-- - user_id PK + auth.users CASCADE → 탈퇴 시 자동 정리
-- - RLS 본인 RW (민감 정보)
-- - region/district 는 user_profiles 와 중복 가능 — business 측 우선 사용

CREATE TABLE IF NOT EXISTS public.business_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 업종 (lib/profile-options.ts BUSINESS_INDUSTRY_OPTIONS 와 일치)
  -- food / retail / manufacturing / service / it / other
  industry TEXT,

  -- 매출 규모 (전년도 또는 추정)
  -- under_50m / 50m_500m / 500m_1b / 1b_10b / over_10b
  revenue_scale TEXT,

  -- 상시근로자 수 (사장님 본인 제외)
  -- none / 1_4 / 5_9 / 10_49 / 50_99 / over_100
  employee_count TEXT,

  -- 사업자 유형
  -- sole_proprietor (개인) / corporation (법인)
  business_type TEXT,

  -- 사업자등록일 (창업 N년차 자격 매칭용)
  established_date DATE,

  -- 사업장 소재 지역 (REGION_OPTIONS 와 일치)
  region TEXT,
  -- 시·군·구
  district TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거 (다른 테이블 동일 패턴)
CREATE OR REPLACE FUNCTION public.business_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS trg_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER trg_business_profiles_updated_at
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.business_profiles_set_updated_at();

-- RLS — 본인만 R/W (민감 정보, 외부 노출 금지)
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own select" ON public.business_profiles;
CREATE POLICY "own select" ON public.business_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own insert" ON public.business_profiles;
CREATE POLICY "own insert" ON public.business_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own update" ON public.business_profiles;
CREATE POLICY "own update" ON public.business_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own delete" ON public.business_profiles;
CREATE POLICY "own delete" ON public.business_profiles
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 권한: anon 차단, authenticated 만
REVOKE ALL ON public.business_profiles FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_profiles TO authenticated;
