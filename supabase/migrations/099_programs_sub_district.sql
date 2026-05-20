-- ============================================================
-- 099: welfare/loan/news 에 sub_district 컬럼 추가 — District Phase B 2단계 (5/20)
-- ============================================================
-- 정책 (welfare_programs / loan_programs) 과 뉴스 (news_posts) 의 본문에서
-- extractSubDistrict 추출 → sub_district 컬럼 백필.
-- 사용자 user_profiles.sub_district 와 정확 매칭 시 region_sub_district +20점.
-- ============================================================

ALTER TABLE welfare_programs ADD COLUMN sub_district text;
ALTER TABLE loan_programs ADD COLUMN sub_district text;
ALTER TABLE news_posts ADD COLUMN sub_district text;

COMMENT ON COLUMN welfare_programs.sub_district IS
  'District Phase B (5/20) — 읍·면·동·리 단위 (예: 매월리). extractSubDistrict 백필. user.sub_district 와 정확 매칭 시 region_sub_district +20점.';
COMMENT ON COLUMN loan_programs.sub_district IS
  'District Phase B (5/20) — 읍·면·동·리. welfare 와 동일 패턴.';
COMMENT ON COLUMN news_posts.sub_district IS
  'District Phase B (5/20) — 읍·면·동·리. welfare 와 동일 패턴.';
