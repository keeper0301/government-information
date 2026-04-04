-- 복지/대출 프로그램 상세 정보 필드 추가

-- welfare_programs: 복지로 상세 API 보강용 필드
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS serv_id TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS detailed_content TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS selection_criteria TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS required_documents TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS contact_info TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_welfare_serv_id ON welfare_programs(serv_id);

-- loan_programs: 상세 정보 필드
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS detailed_content TEXT;
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS required_documents TEXT;
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS contact_info TEXT;
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
