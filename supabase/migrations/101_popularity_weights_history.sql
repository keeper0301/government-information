-- ============================================================
-- 101_popularity_weights_history.sql
-- popularity boost weights 자가 진화 학습 (Spec 2)
-- ============================================================
-- 매주 월 02:30 KST cron 이 30일 view->apply 전환율 측정 →
-- apply_weight ±0.5 자동 튜닝 (view_weight·max_boost 는 5/17 검증 hardcode 유지).
-- 이 테이블에 새 row insert (변경 시).
-- loadCurrentWeights() 가 effective_from DESC 최상단 row 를 5분 cache 로 조회.
--
-- 학습 룰:
--   - 데이터 부족 (unique_users<5 OR total_events<100): no-op
--   - 전환율 < 1% (인기 view 폭주, apply 0): apply_weight +0.5 (cap 4)
--   - 전환율 > 15% (apply 과다, view 적음): apply_weight -0.5 (min 1)
--   - 그 외: 변경 없음
-- ============================================================

CREATE TABLE IF NOT EXISTS popularity_weights_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  view_weight NUMERIC(4,2) NOT NULL,
  apply_weight NUMERIC(4,2) NOT NULL,
  max_boost NUMERIC(4,2) NOT NULL,
  reason TEXT NOT NULL,
  conversion_rate_30d NUMERIC(5,2),
  unique_users_30d INT,
  total_events_30d INT,
  data_snapshot JSONB,
  applied_by TEXT NOT NULL CHECK (applied_by IN ('cron_learn','manual_override','initial_seed')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_popularity_weights_history_effective_from
  ON popularity_weights_history (effective_from DESC);

COMMENT ON TABLE popularity_weights_history IS
  'Recommendation popularity weights 자가 진화 학습. 매주 cron 측정 후 변경 시 새 row. effective_from DESC 최상단 = active.';

-- 학습 seed — 5/17 A 12차 hardcode 값 (5/16~26 user_events 사용자 1명 단계)
INSERT INTO popularity_weights_history
  (view_weight, apply_weight, max_boost, reason,
   conversion_rate_30d, unique_users_30d, total_events_30d, applied_by, data_snapshot)
VALUES (
  0.5,
  2.0,
  5.0,
  '초기 seed — 5/17 A 12차 hardcode 그대로 (VIEW 0.5, APPLY 2, MAX 5). 사용자 풀 확장 후 cron 자동 튜닝.',
  0.53,
  1,
  569,
  'initial_seed',
  jsonb_build_object(
    'note', '30일 user_events: view 566, apply 3, unique_user 1 (사장님 본인 테스트 단계)',
    'period_start', '2026-05-16',
    'period_end', '2026-05-26',
    'view_count', 566,
    'apply_count', 3
  )
);

ALTER TABLE popularity_weights_history ENABLE ROW LEVEL SECURITY;
