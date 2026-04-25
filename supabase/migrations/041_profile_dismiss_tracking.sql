-- 사용자가 온보딩을 완료/스킵한 시각 기록
-- - 첫 로그인 시 자동 redirect 여부 판단에 사용 (NULL 이면 redirect)
-- - "완료" 와 "건너뛰기" 모두 이 timestamp 채움 (재팝업 방지)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS dismissed_onboarding_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.dismissed_onboarding_at IS
  '온보딩 완료/스킵 시각. NULL 이면 첫 로그인 시 /onboarding 으로 redirect';
