-- supabase/migrations/043_program_targeting_columns.sql
-- Phase 1.5: 정책 본문 분석으로 채울 자격 컬럼
-- - income_target_level: 정책이 요구하는 소득 수준 (low/mid_low/mid/any/null)
-- - household_target_tags: 정책 대상 가구 유형 배열
-- - last_targeting_analyzed_at: cron 마지막 분석 시각 (NULL=미분석)

ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS income_target_level TEXT
    CHECK (income_target_level IN ('low','mid_low','mid','any') OR income_target_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_target_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_targeting_analyzed_at TIMESTAMPTZ;

ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS income_target_level TEXT
    CHECK (income_target_level IN ('low','mid_low','mid','any') OR income_target_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_target_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_targeting_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_welfare_household_target
  ON welfare_programs USING GIN (household_target_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_income_target
  ON welfare_programs (income_target_level);
CREATE INDEX IF NOT EXISTS idx_welfare_last_analyzed
  ON welfare_programs (last_targeting_analyzed_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_household_target
  ON loan_programs USING GIN (household_target_tags);
CREATE INDEX IF NOT EXISTS idx_loan_income_target
  ON loan_programs (income_target_level);
CREATE INDEX IF NOT EXISTS idx_loan_last_analyzed
  ON loan_programs (last_targeting_analyzed_at NULLS FIRST);

COMMENT ON COLUMN welfare_programs.income_target_level IS
  'Phase 1.5: 정책이 요구하는 소득 수준 (low=기초생활, mid_low=차상위, mid=중위 100~150%, any=무관). NULL=미분석/불명';
COMMENT ON COLUMN welfare_programs.household_target_tags IS
  'Phase 1.5: 정책이 대상으로 하는 가구 유형 (single_parent, multi_child, married, disabled_family, elderly_family, single)';
COMMENT ON COLUMN welfare_programs.last_targeting_analyzed_at IS
  'Phase 1.5 enrich-targeting cron 마지막 분석 시각. NULL=미분석, updated_at 보다 작으면 재분석 대상';
