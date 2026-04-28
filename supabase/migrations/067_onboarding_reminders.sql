-- ============================================================
-- 067_onboarding_reminders.sql — 환영 이메일 dedup 테이블
-- ============================================================
-- /api/cron/onboarding-reminder cron 이 가입 24h~48h 전 + 온보딩 미완
-- 사용자에게 환영 이메일 1회 발송할 때 dedup 보장.
--
-- INSERT 가 UNIQUE PK 위반하면 해당 사용자는 이미 발송됨 → skip.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.onboarding_reminders (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_reminders IS
  '온보딩 미완 환영 이메일 dedup. 1인 1회 발송 보장. /api/cron/onboarding-reminder 가 INSERT.';

-- RLS — 정책 미정의 → admin client (service role) 만 접근 가능. anon/authenticated 차단.
ALTER TABLE public.onboarding_reminders ENABLE ROW LEVEL SECURITY;
