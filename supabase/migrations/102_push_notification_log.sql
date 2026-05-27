-- ============================================================
-- 102_push_notification_log.sql
-- PWA 푸시 발송 기록 + 클릭 추적 (Spec 3-A)
-- ============================================================
-- 매일 push-send cron 발송 결과 + 사용자 클릭 시각 누적.
-- push-time-learn cron 이 sent_hour_kst × click_hour_kst 로 사용자별
-- 시간대별 클릭률 측정 → push_user_preferences.preferred_hours 자동 학습.
--
-- send_status:
--   - 'success': 200 OK
--   - 'failed_410': 구독 만료/취소 (subscription endpoint 정리 대상)
--   - 'failed_404': endpoint 존재 X (정리 대상)
--   - 'failed_other': 일시 오류 (재시도 가능)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_notification_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_endpoint TEXT NOT NULL,
  payload JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_hour_kst SMALLINT NOT NULL CHECK (sent_hour_kst BETWEEN 0 AND 23),
  send_status TEXT NOT NULL CHECK (send_status IN ('success','failed_410','failed_404','failed_other')),
  send_error TEXT,
  clicked_at TIMESTAMPTZ,
  click_hour_kst SMALLINT CHECK (click_hour_kst BETWEEN 0 AND 23),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_log_user_sent_hour
  ON push_notification_log (user_id, sent_hour_kst);
CREATE INDEX IF NOT EXISTS idx_push_log_sent_at
  ON push_notification_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_clicked
  ON push_notification_log (user_id, clicked_at)
  WHERE clicked_at IS NOT NULL;

COMMENT ON TABLE push_notification_log IS
  'PWA push send result + click tracking. push-time-learn cron measures click rate per hour to evolve preferred_hours.';

ALTER TABLE push_notification_log ENABLE ROW LEVEL SECURITY;

-- 사용자는 자기 row 만 조회 (클릭 통계 보고용)
CREATE POLICY push_log_user_select ON push_notification_log
  FOR SELECT USING (auth.uid() = user_id);
