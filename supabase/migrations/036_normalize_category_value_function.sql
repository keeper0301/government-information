-- 036_normalize_category_value_function.sql
-- 매핑 단일 출처화 — 마이그 032/033 (1회 정규화) + 035 (BEFORE 트리거) 가
-- 같은 CASE 매핑을 3곳에 중복 보관하던 구조를 함수 1개로 통일.
-- 향후 매핑 추가 시 normalize_program_category_value() 한 곳만 수정.
--
-- ROLLBACK:
--   035 의 trigger 본체를 다시 직접 CASE 로 되돌리고
--   DROP FUNCTION normalize_program_category_value;

-- 순수 매핑 함수 (STABLE — 같은 input 이면 같은 output, side effect 없음).
-- IMMUTABLE 가 더 엄격하지만 향후 룰 변경 가능성 고려해 STABLE 로.
CREATE OR REPLACE FUNCTION normalize_program_category_value(_raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE _raw
    WHEN '소득' THEN '생계'
    WHEN '재난' THEN '생계'
    WHEN '소상공인' THEN '창업'
    WHEN '농업' THEN '기타'
    WHEN '대출' THEN '금융'
    WHEN '보증' THEN '금융'
    WHEN '창업지원' THEN '창업'
    WHEN '소상공인지원' THEN '창업'
    WHEN '지원금' THEN '생계'
    ELSE _raw
  END;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION normalize_program_category_value IS
  '비표준 category 값 → BENEFIT_TAGS 표준값. 트리거(035)·일회성 정규화·신규 마이그 모두 이 함수 사용.';

-- 035 트리거의 본체를 함수 호출로 단순화. CASE 중복 제거.
CREATE OR REPLACE FUNCTION normalize_program_category()
RETURNS TRIGGER AS $$
BEGIN
  NEW.category := normalize_program_category_value(NEW.category);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
