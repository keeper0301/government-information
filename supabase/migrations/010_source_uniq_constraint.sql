-- ============================================================
-- 010: (source_code, source_id) UNIQUE CONSTRAINT 정식 추가
-- ============================================================
-- 배경 (2026-04-23):
--   007 마이그레이션이 partial unique INDEX 를 만들었음:
--     CREATE UNIQUE INDEX idx_*_source_uniq
--       ON ... (source_code, source_id)
--       WHERE source_code IS NOT NULL AND source_id IS NOT NULL
--
--   그러나 PostgREST 의 .upsert({ onConflict: "source_code,source_id" })
--   가 partial index 매칭 못 함 → 에러:
--     "there is no unique or exclusion constraint matching the
--      ON CONFLICT specification"
--
--   → batch upsert (200건) 가 매번 실패 → 개별 폴백 (200건 × 2 RPC)
--   → 60초 한도 초과 → 504. 신규 3개 source 가 매번 stuck 한 진짜 이유.
--
-- 수정:
--   정식 UNIQUE CONSTRAINT 추가. NULL 은 PostgreSQL 기본 동작으로
--   다중 허용되므로 옛 레거시 row (source_code/source_id NULL) 영향 없음.
-- ============================================================

ALTER TABLE welfare_programs
  ADD CONSTRAINT welfare_source_code_id_uniq UNIQUE (source_code, source_id);

ALTER TABLE loan_programs
  ADD CONSTRAINT loan_source_code_id_uniq UNIQUE (source_code, source_id);

-- 기존 partial index 는 새 constraint 가 만든 index 와 중복 → 제거
DROP INDEX IF EXISTS idx_welfare_source_uniq;
DROP INDEX IF EXISTS idx_loan_source_uniq;
