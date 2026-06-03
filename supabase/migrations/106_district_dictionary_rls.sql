-- 106 district_dictionary RLS — advisor ERROR(rls_disabled_in_public) 해소
-- ============================================================
-- district_dictionary = 행정구역 사전(시·도·시·군·구·읍·면·동, level 1/2/3). 공개 정보(민감도 0).
-- 코드에서 직접 쿼리 없음(lib/region/district-extractor.ts 는 inline 데이터 사용, DB 는 미래
-- form lookup 용). RLS 비활성으로 public 노출 중이던 것을 활성화.
--   - 읽기(SELECT): public 유지 (행정구역은 공개 정보 + 미래 form 자동완성 대비, 회귀 0)
--   - 쓰기(INSERT/UPDATE/DELETE): 정책 없음 → anon/authenticated 차단. seed 는 service_role(RLS 우회).
-- ============================================================

ALTER TABLE public.district_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "district_dictionary_public_read"
  ON public.district_dictionary
  FOR SELECT
  USING (true);
