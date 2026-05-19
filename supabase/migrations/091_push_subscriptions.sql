-- 2026-05-19 — Web Push 구독 (spec: 2026-05-19-pwa-push-notifications.md)
-- 사장님 "DDL 091 apply" 명시 승인 후만 apply.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_created
  ON push_subscriptions(created_at DESC);

-- RLS — service_role 만 접근 (사용자 endpoint 보호)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE push_subscriptions IS
  'Web Push 구독. PWA 푸시 알림 발송 시 endpoint + keys 사용. service_role 만 접근.';
