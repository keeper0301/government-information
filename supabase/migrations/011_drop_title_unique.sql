-- ============================================================
-- 011: title 단독 UNIQUE INDEX 제거
-- ============================================================
-- 010 으로 (source_code, source_id) UNIQUE CONSTRAINT 추가 후, batch
-- UPSERT 가 ON CONFLICT (source_code, source_id) UPDATE 시도하다가
-- title 컬럼의 다른 unique 인덱스 (idx_*_title_unique) 위반 → 또 60초
-- timeout (debug stream 측정: 2.8초만에 에러).
--
-- 같은 title 다른 source 가 있을 수 있음 (예: 같은 금융 상품을 fsc·kinfa
-- 둘 다 등록). source_code,source_id 로 이미 unique 보장되므로 title
-- 단독 unique 는 불필요·해롭기만 함.
-- ============================================================

DROP INDEX IF EXISTS idx_welfare_title_unique;
DROP INDEX IF EXISTS idx_loan_title_unique;
