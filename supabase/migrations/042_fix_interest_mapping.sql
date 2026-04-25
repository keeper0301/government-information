-- 042_fix_interest_mapping.sql
-- 039 의 interest → benefit_tags 매핑이 plan 작성 시 가정한 라벨 (주거/의료·건강/취업·창업/...) 과
-- 실제 마이페이지 INTERESTS 9개 (복지/대출/청년/출산·육아/창업/주거/교육/의료/고용) 가 다른 것이
-- DB 검증 단계에서 발견됨. 정확한 매핑으로 함수 재정의 + 기존 row 재계산.
--
-- 매핑 결정 근거 (사장님 결정 2026-04-25):
-- - 복지 → 매핑 없음 (너무 광범위. 생계/의료/양육 어느 하나로도 정확하지 않음)
-- - 청년 → 매핑 없음 (인구통계 신호, BENEFIT_TAGS 가 아닌 ageTags 영역)
-- - 나머지 7개는 1:1 자연스러운 매핑

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
      WHEN '의료'      THEN result_tags := result_tags || ARRAY['의료'];
      WHEN '고용'      THEN result_tags := result_tags || ARRAY['취업'];
      WHEN '창업'      THEN result_tags := result_tags || ARRAY['창업'];
      WHEN '교육'      THEN result_tags := result_tags || ARRAY['교육'];
      WHEN '대출'      THEN result_tags := result_tags || ARRAY['금융'];
      WHEN '출산·육아' THEN result_tags := result_tags || ARRAY['양육'];
      WHEN '복지'      THEN -- 너무 광범위, 매핑 없음 (사장님 결정)
      WHEN '청년'      THEN -- 인구통계 신호, BENEFIT_TAGS 매핑 없음
      ELSE -- 알 수 없는 값은 무시
    END CASE;
  END LOOP;

  NEW.benefit_tags := (SELECT ARRAY(SELECT DISTINCT unnest(result_tags)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 row 재계산
UPDATE user_profiles SET interests = interests WHERE interests IS NOT NULL;
