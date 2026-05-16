-- ============================================================
-- 090: 시·군 (district) 컬럼 추가 (welfare + loan)
-- ============================================================
-- 사장님 거주지 (전남 순천) 매칭 정확도 향상.
-- 기존 region 컬럼은 광역 ("전라남도") 만 저장 → 시·군 (순천시) 단위 매칭 X.
-- title/content 에서 자동 추출 (lib/region/district-extractor.ts) 후 백필.
--
-- destructive 안 함:
--   - NULLable 컬럼 추가 (기존 row 영향 0)
--   - partial index (district IS NOT NULL) — 매칭 query 가속, 부담 0
--
-- news_posts / press_ingest_candidates 는 Phase B (외부 수집) 시점에
-- region + district 같이 추가 — 이번 마이그레이션은 사장님 즉시 추천
-- 정확도 향상 핵심인 welfare + loan 만.
-- ============================================================

-- welfare_programs: region 이미 있음. district 만 추가.
ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS district VARCHAR(20);

CREATE INDEX IF NOT EXISTS welfare_programs_district_idx
  ON welfare_programs (district)
  WHERE district IS NOT NULL;

COMMENT ON COLUMN welfare_programs.district IS
  '시·군·구 단위 (예: 순천시). title/content 에서 자동 추출. NULL = 광역/전국 정책.';

-- loan_programs: region 컬럼도 없음. 둘 다 추가.
ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS region VARCHAR(40),
  ADD COLUMN IF NOT EXISTS district VARCHAR(20);

CREATE INDEX IF NOT EXISTS loan_programs_region_idx
  ON loan_programs (region)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS loan_programs_district_idx
  ON loan_programs (district)
  WHERE district IS NOT NULL;

COMMENT ON COLUMN loan_programs.region IS
  '광역 단위 (예: 전라남도). title/source 에서 자동 추출.';

COMMENT ON COLUMN loan_programs.district IS
  '시·군·구 단위 (예: 순천시). title/content 에서 자동 추출. NULL = 광역/전국 정책.';
