-- 033_normalize_loan_categories.sql
-- loan_programs.category 를 BENEFIT_TAGS 14종 안으로 정규화.
-- "대출"·"금융"·"보증" → 모두 "금융" (의미 중복 제거).
-- ROLLBACK: 비가역.

UPDATE loan_programs SET category = '금융' WHERE category IN ('대출', '보증');
UPDATE loan_programs SET category = '창업' WHERE category IN ('창업지원', '소상공인지원');
UPDATE loan_programs SET category = '생계' WHERE category = '지원금';
