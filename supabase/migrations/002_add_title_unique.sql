-- Add unique constraint on title for upsert support
-- Using CREATE UNIQUE INDEX IF NOT EXISTS to be idempotent
CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_title_unique ON welfare_programs(title);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_title_unique ON loan_programs(title);
