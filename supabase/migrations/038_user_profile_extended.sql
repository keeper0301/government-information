-- 맞춤형 추천을 위한 user_profiles 컬럼 확장
-- - income_level: 기준중위소득 비율 구간 (수치 입력 회피)
-- - household_types: 다중 선택 (한부모이자 다자녀 가능)
-- - benefit_tags: interests 9종을 BENEFIT_TAGS 14종으로 변환·캐시 (조회 속도)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS income_level TEXT
    CHECK (income_level IN ('low', 'mid_low', 'mid', 'mid_high', 'high') OR income_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_profiles_benefit_tags
  ON user_profiles USING GIN (benefit_tags);

CREATE INDEX IF NOT EXISTS idx_user_profiles_household_types
  ON user_profiles USING GIN (household_types);

COMMENT ON COLUMN user_profiles.income_level IS
  '소득 구간 (low=기초생활, mid_low=차상위, mid=중위, mid_high=중위 이상, high=고소득)';
COMMENT ON COLUMN user_profiles.household_types IS
  '가구 상태 다중 (single, married, single_parent, multi_child, disabled_family, elderly_family)';
COMMENT ON COLUMN user_profiles.benefit_tags IS
  'interests 를 BENEFIT_TAGS 14종으로 변환한 캐시. 039 트리거가 자동 채움';
