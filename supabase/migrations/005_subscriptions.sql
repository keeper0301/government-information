-- ============================================================
-- 구독 결제 시스템 (토스페이먼츠 빌링키 정기결제)
-- ============================================================
-- 1유저당 1구독. 무료/베이직/프로 3티어.
-- 빌링키는 토스에서 발급받아 저장, 매월 자동결제 시 사용.
-- ============================================================

-- updated_at 자동 갱신용 함수 (재사용 가능)
-- 향후 다른 테이블에서도 BEFORE UPDATE 트리거로 활용 가능
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- subscriptions: 사용자별 구독 정보 (1유저 1행)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 요금제 (무료/베이직/프로)
  tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'basic', 'pro')),

  -- 구독 상태
  --   free:      무료 사용자
  --   pending:   결제 페이지 진입, 아직 카드 등록 전 (tier 변조 방지용 의도 기록)
  --   trialing:  7일 무료체험 중 (카드 등록 완료)
  --   active:    정상 결제 중
  --   charging:  결제 시도 중 (락 — 동일 사용자 동시 결제 방지)
  --   past_due:  결제 실패 (재시도 대기)
  --   cancelled: 해지됨 (current_period_end 까지는 사용 가능)
  status TEXT NOT NULL DEFAULT 'free'
    CHECK (status IN ('free', 'pending', 'trialing', 'active', 'charging', 'past_due', 'cancelled')),

  -- 토스페이먼츠 빌링키 정보 (무료 사용자는 NULL)
  billing_key TEXT,           -- 토스가 발급하는 자동결제 키
  customer_key TEXT,          -- 토스에 보낸 customerKey (보통 user.id 그대로)
  customer_email TEXT,        -- 결제 영수증·실패 알림 발송용 (auth.users 와 별도 캐시)
  card_company TEXT,          -- 카드사 (예: "현대카드")
  card_number_masked TEXT,    -- 마스킹된 카드번호 (예: "1234-****-****-5678")

  -- 결제 주기
  trial_ends_at TIMESTAMPTZ,        -- 무료체험 종료 시각
  current_period_end TIMESTAMPTZ,   -- 현재 결제 주기 종료 (= 다음 결제일)
  cancelled_at TIMESTAMPTZ,         -- 사용자가 해지한 시각

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- payment_history: 결제 시도 이력 (감사·환불·디버깅용)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  payment_key TEXT,                   -- 토스 paymentKey (성공 시 부여)
  order_id TEXT NOT NULL UNIQUE,      -- 우리가 발급한 주문번호 (중복 결제 방지용)
  amount INTEGER NOT NULL,            -- 결제 금액 (원, 정수)
  tier TEXT NOT NULL,                 -- 결제 시점의 티어
  status TEXT NOT NULL,               -- DONE / FAILED / CANCELLED
  failure_code TEXT,                  -- 토스 에러 코드 (실패 시)
  failure_reason TEXT,                -- 토스 에러 메시지 (실패 시)
  paid_at TIMESTAMPTZ,                -- 토스 approvedAt
  raw_response JSONB,                 -- 토스 원본 응답 (디버깅용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS (Row Level Security) — 본인 데이터만 조회
-- INSERT/UPDATE 는 service_role (서버) 만 가능
-- ============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- 본인 구독 조회만 허용
CREATE POLICY "subscription_own_read" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- 본인 결제 이력 조회만 허용
CREATE POLICY "payment_own_read" ON payment_history
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
-- 자동결제 cron 이 trial 만료 / 결제 주기 만료 사용자를 빨리 찾도록
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON subscriptions(trial_ends_at)
  WHERE status = 'trialing';
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_payment_user ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_order ON payment_history(order_id);
