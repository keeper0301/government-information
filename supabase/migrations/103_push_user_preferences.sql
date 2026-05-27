-- ============================================================
-- 103_push_user_preferences.sql
-- PWA 푸시 사용자별 시간대 선호도 (Spec 3-B 자가 진화 학습)
-- ============================================================
-- push-time-learn cron 이 매주 월 03:00 KST 측정 →
-- 사용자별 시간대 클릭률 top 3 시간대를 preferred_hours 에 update.
-- push-send cron 이 매일 사용자별 preferred_hours 시간에 발송.
--
-- 학습 룰:
--   - 누적 발송 < 14건 (2주 분량): default 시간대 유지 (9, 12, 18 KST)
--   - 누적 발송 ≥ 14건: click_rate_per_hour 상위 3개 시간대로 update
--
-- 변경 폭 cap: 한 사용자 당 한 사이클에 ±1 hour 만 변경 (overfit 차단)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_hours SMALLINT[] NOT NULL DEFAULT ARRAY[9,12,18]::SMALLINT[],
  click_rate_per_hour JSONB,
  total_sent_for_learn INT NOT NULL DEFAULT 0,
  last_learned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (array_length(preferred_hours, 1) BETWEEN 1 AND 5)
);

COMMENT ON TABLE push_user_preferences IS
  'Per-user push send time preferences. push-time-learn cron measures click rate per hour to evolve preferred_hours.';

ALTER TABLE push_user_preferences ENABLE ROW LEVEL SECURITY;

-- 사용자는 자기 row 조회·수정
CREATE POLICY push_pref_user_select ON push_user_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY push_pref_user_update ON push_user_preferences
  FOR UPDATE USING (auth.uid() = user_id);
