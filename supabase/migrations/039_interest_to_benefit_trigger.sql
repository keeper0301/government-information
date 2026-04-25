-- user_profiles.interests 가 변경될 때 benefit_tags 자동 재계산
-- - interests 9종 → BENEFIT_TAGS 14종 매핑 (lib/personalization/interest-mapping.ts 와 동일)
-- - INSERT 와 UPDATE 모두 trigger
-- - lib 레벨 매핑이 truth, DB 트리거는 캐시 동기화 보장용

CREATE OR REPLACE FUNCTION normalize_interests_to_benefit_tags()
RETURNS TRIGGER AS $$
DECLARE
  result_tags TEXT[] := '{}';
  it TEXT;
BEGIN
  IF NEW.interests IS NULL OR array_length(NEW.interests, 1) IS NULL THEN
    NEW.benefit_tags := '{}';
    RETURN NEW;
  END IF;

  FOREACH it IN ARRAY NEW.interests LOOP
    CASE it
      WHEN '주거'      THEN result_tags := result_tags || ARRAY['주거'];
      WHEN '의료/건강' THEN result_tags := result_tags || ARRAY['의료'];
      WHEN '취업/창업' THEN result_tags := result_tags || ARRAY['취업', '창업'];
      WHEN '양육/보육' THEN result_tags := result_tags || ARRAY['양육'];
      WHEN '교육'      THEN result_tags := result_tags || ARRAY['교육'];
      WHEN '복지/생계' THEN result_tags := result_tags || ARRAY['생계', '금융'];
      WHEN '문화/여가' THEN result_tags := result_tags || ARRAY['문화'];
      WHEN '교통'      THEN result_tags := result_tags || ARRAY['교통'];
      WHEN '법률/상담' THEN result_tags := result_tags || ARRAY['법률'];
      ELSE -- 알 수 없는 값은 무시
    END CASE;
  END LOOP;

  NEW.benefit_tags := (SELECT ARRAY(SELECT DISTINCT unnest(result_tags)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_interests ON user_profiles;
CREATE TRIGGER trg_normalize_interests
  BEFORE INSERT OR UPDATE OF interests ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION normalize_interests_to_benefit_tags();

-- 기존 row 일괄 변환 (UPDATE 트리거가 다시 실행됨)
UPDATE user_profiles SET interests = interests WHERE interests IS NOT NULL;
