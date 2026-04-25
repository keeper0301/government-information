-- 032_normalize_welfare_categories.sql
-- welfare_programs.category 를 BENEFIT_TAGS 14종 안으로 정규화.
-- 비표준값: 소득(6133)·재난(223)·소상공인(2)·농업(1)
-- ROLLBACK: 본 마이그레이션은 비가역. 필요 시 raw_payload 에서 원본 복원 가능.

UPDATE welfare_programs SET category = '생계' WHERE category IN ('소득', '재난');
UPDATE welfare_programs SET category = '창업' WHERE category = '소상공인';
UPDATE welfare_programs SET category = '기타' WHERE category = '농업';
