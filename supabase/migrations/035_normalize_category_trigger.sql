-- 035_normalize_category_trigger.sql
-- welfare_programs / loan_programs 의 category 컬럼을 INSERT/UPDATE 시 자동 정규화.
-- 16개 컬렉터를 개별 수정하는 대신 DB 단계에서 한 번에 처리.
-- 향후 추가될 컬렉터도 자동 적용 (정합성 유지 비용 0).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS welfare_normalize_category ON welfare_programs;
--   DROP TRIGGER IF EXISTS loan_normalize_category ON loan_programs;
--   DROP FUNCTION IF EXISTS normalize_program_category;

CREATE OR REPLACE FUNCTION normalize_program_category()
RETURNS TRIGGER AS $$
BEGIN
  -- BENEFIT_TAGS 14종 외 값을 표준값으로 변환.
  -- 마이그레이션 032/033 의 매핑과 동일.
  NEW.category := CASE NEW.category
    WHEN '소득' THEN '생계'
    WHEN '재난' THEN '생계'
    WHEN '소상공인' THEN '창업'
    WHEN '농업' THEN '기타'
    WHEN '대출' THEN '금융'
    WHEN '보증' THEN '금융'
    WHEN '창업지원' THEN '창업'
    WHEN '소상공인지원' THEN '창업'
    WHEN '지원금' THEN '생계'
    ELSE NEW.category
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS welfare_normalize_category ON welfare_programs;
CREATE TRIGGER welfare_normalize_category
  BEFORE INSERT OR UPDATE OF category ON welfare_programs
  FOR EACH ROW EXECUTE FUNCTION normalize_program_category();

DROP TRIGGER IF EXISTS loan_normalize_category ON loan_programs;
CREATE TRIGGER loan_normalize_category
  BEFORE INSERT OR UPDATE OF category ON loan_programs
  FOR EACH ROW EXECUTE FUNCTION normalize_program_category();

COMMENT ON FUNCTION normalize_program_category IS
  '비표준 category 값(소득·재난·대출 등) → BENEFIT_TAGS 표준값. 035 trigger 에서 사용.';
