-- 자동 생성된 알림 규칙과 사용자 수동 규칙 구분
-- - is_auto_generated: 자동 규칙은 프로필 갱신 시 갱신, 수동 규칙은 보존
-- - auto_rule_disabled_at: 사용자가 자동 규칙을 끄면 다시 자동 생성하지 않음

ALTER TABLE user_alert_rules
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_rule_disabled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_auto_rule
  ON user_alert_rules (user_id)
  WHERE is_auto_generated = TRUE;

COMMENT ON COLUMN user_alert_rules.is_auto_generated IS
  '온보딩/프로필 저장 시 자동 생성된 규칙 (사용자 수동 규칙과 구분)';
COMMENT ON COLUMN user_alert_rules.auto_rule_disabled_at IS
  '사용자가 자동 규칙을 직접 끈 시각. NULL 이면 자동 갱신 대상';
