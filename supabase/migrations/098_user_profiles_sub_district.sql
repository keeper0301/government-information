-- ============================================================
-- 098: user_profiles 에 sub_district 컬럼 추가 — District Phase B (5/20)
-- ============================================================
-- 사용자 거주지 읍·면·동·리 단위 (예: 매월리, 월등면).
-- 정책 매칭 시 district + sub_district 일치 → region_sub_district kind +20 점.
-- (region-match.ts evaluateRegion 함수 참고)
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN sub_district text,
  ADD COLUMN sub_district_confirmed_at timestamptz;

COMMENT ON COLUMN user_profiles.sub_district IS
  'District Phase B (5/20) — 사용자 거주지 읍·면·동·리 단위 (예: 매월리, 월등면). district 정확화 +20점 매칭.';
