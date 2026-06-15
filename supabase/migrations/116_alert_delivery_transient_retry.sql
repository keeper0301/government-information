-- 116_alert_delivery_transient_retry.sql
-- Transient Kakao delivery skips must not occupy the idempotency ledger.
-- If they stay in alert_deliveries, UNIQUE(rule_id, program_table, program_id, channel)
-- blocks a later successful retry after consent/provider/time-window is fixed.

DELETE FROM public.alert_deliveries
WHERE channel = 'kakao'
  AND status = 'skipped'
  AND error IN (
    'consent_missing',
    'quiet_hours_kst',
    'kakao_provider_not_configured'
  );
