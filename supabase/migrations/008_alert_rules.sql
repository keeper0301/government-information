-- ============================================================
-- 008: 맞춤 알림 규칙 + 발송 이력
-- ============================================================
-- 사용자가 "지역/연령/업종/혜택/가구형태" 조건을 등록하면
-- 새 정책이 매칭될 때마다 이메일·알림톡으로 알림.
-- 기존 alarm_subscriptions(개별 정책 알림)와는 별개로 운영.
-- ============================================================

-- ━━━ 사용자 알림 규칙 ━━━
CREATE TABLE IF NOT EXISTS user_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 규칙 정보
  name TEXT NOT NULL DEFAULT '내 맞춤 알림',

  -- 매칭 조건 (배열이 비어있으면 그 차원은 "전체" 로 간주)
  region_tags TEXT[] DEFAULT '{}',
  age_tags TEXT[] DEFAULT '{}',
  occupation_tags TEXT[] DEFAULT '{}',
  benefit_tags TEXT[] DEFAULT '{}',
  household_tags TEXT[] DEFAULT '{}',

  -- 자유 키워드 (title·description 에 ilike 검색)
  keyword TEXT,

  -- 수신 채널: 'email' 또는 'kakao'
  channels TEXT[] NOT NULL DEFAULT ARRAY['email'],

  -- 알림톡 수신 번호 (pro 사용자만 입력)
  phone_number TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user
  ON user_alert_rules(user_id) WHERE is_active;

-- 본인만 읽고 쓸 수 있음 (서비스 계정은 service_role 로 우회)
ALTER TABLE user_alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_own_all" ON user_alert_rules;
CREATE POLICY "alert_rules_own_all" ON user_alert_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ━━━ 발송 이력 (중복 방지 + 사용자 화면용) ━━━
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES user_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 매칭된 정책
  program_table TEXT NOT NULL CHECK (program_table IN ('welfare_programs','loan_programs')),
  program_id UUID NOT NULL,
  program_title TEXT,          -- 정책 삭제되어도 화면에 표시되도록 snapshot

  channel TEXT NOT NULL CHECK (channel IN ('email','kakao')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 규칙·같은 정책·같은 채널 조합은 한 번만 — 중복 발송 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_once
  ON alert_deliveries(rule_id, program_table, program_id, channel);

CREATE INDEX IF NOT EXISTS idx_delivery_user_created
  ON alert_deliveries(user_id, created_at DESC);

ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

-- 본인 것만 조회 (수정은 서버만)
DROP POLICY IF EXISTS "alert_deliveries_own_read" ON alert_deliveries;
CREATE POLICY "alert_deliveries_own_read" ON alert_deliveries
  FOR SELECT USING (auth.uid() = user_id);

-- ━━━ updated_at 자동 갱신 트리거 ━━━
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_rules_updated_at ON user_alert_rules;
CREATE TRIGGER trg_alert_rules_updated_at
  BEFORE UPDATE ON user_alert_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
