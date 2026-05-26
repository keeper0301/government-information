-- ============================================================
-- 100_press_auto_confirm_settings.sql
-- press_ingest tier_floor 자가 진화 학습 (Spec 1)
-- ============================================================
-- 매주 월 02:00 KST cron 이 7일 mid 회수율·low confirm 비율 측정
-- → tier_floor (high/mid/low) 자동 결정 → 이 테이블에 새 row insert.
-- shouldAutoConfirm() 이 effective_from DESC 최상단 row 를 active 설정으로 사용.
--
-- 안전 가드:
--   - env AUTO_CONFIRM_TIER_FLOOR 가 설정되면 그 값이 우선 (긴급 override).
--   - 학습 데이터 부족 (mid_decided<10 AND low_decided<5) 시 cron 은 no-op.
--   - 변경 폭 cap: 한 번에 1단계만 (high ↔ mid ↔ low).
-- ============================================================

CREATE TABLE IF NOT EXISTS press_auto_confirm_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tier_floor TEXT NOT NULL CHECK (tier_floor IN ('high','mid','low')),
  reason TEXT NOT NULL,
  -- 학습에 사용된 측정 데이터 (audit + UI 노출용)
  mid_revoke_rate_7d NUMERIC(5,2),
  low_confirm_rate_7d NUMERIC(5,2),
  mid_decided_count INT,
  low_decided_count INT,
  data_snapshot JSONB,
  -- 변경 출처 — cron 학습 / 사장님 수동 / 초기 seed
  applied_by TEXT NOT NULL CHECK (applied_by IN ('cron_learn','manual_override','initial_seed')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_press_auto_confirm_settings_effective_from
  ON press_auto_confirm_settings (effective_from DESC);

COMMENT ON TABLE press_auto_confirm_settings IS
  'press_ingest tier_floor 자가 진화 학습. 매주 cron 이 회수율·confirm 비율 측정 → 새 row insert. effective_from DESC 최상단 = 현재 active.';

-- 학습 시작 seed — 5/9~5/18 1주차 데이터 기반 (사장님 5/18 수동 결정 기록)
-- 마이그레이션 재실행 시 duplicate 차단: applied_by='initial_seed' 가 이미 있으면 skip
INSERT INTO press_auto_confirm_settings
  (tier_floor, reason, mid_revoke_rate_7d, low_confirm_rate_7d,
   mid_decided_count, low_decided_count, applied_by, data_snapshot)
SELECT
  'high',
  '5/9~5/18 1주차 데이터: mid 회수율 14.2% (>5% 임계) → high 안전 모드. low confirm 2.8% (<30%) → low 확장 가치 X. 사장님 5/18 수동 결정을 자가 학습 seed 로 기록.',
  14.2,
  2.8,
  106,
  36,
  'initial_seed',
  jsonb_build_object(
    'period_start', '2026-05-09',
    'period_end', '2026-05-18',
    'mid_confirmed', 91,
    'mid_rejected', 15,
    'low_confirmed', 1,
    'low_rejected', 35,
    'high_confirmed', 7
  )
WHERE NOT EXISTS (
  SELECT 1 FROM press_auto_confirm_settings WHERE applied_by = 'initial_seed'
);

-- RLS: 어드민만 read/write (admin client = service_role 우회)
ALTER TABLE press_auto_confirm_settings ENABLE ROW LEVEL SECURITY;
