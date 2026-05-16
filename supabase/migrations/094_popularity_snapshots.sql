-- ============================================================
-- 094: popularity_snapshots — 매일 popularity score 누적
-- ============================================================
-- A 12차: 30일 추세 학습. 매일 KST 03:00 cron 으로 그날의 popularity
-- 상태를 snapshot 저장. autonomous hub 차트에서 인기 정책 변동 시각화.
--
-- 데이터 보존: 30일 (cron 에서 자동 cleanup)
-- ============================================================

CREATE TABLE IF NOT EXISTS popularity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  program_id UUID NOT NULL,
  program_table TEXT NOT NULL CHECK (
    program_table IN ('welfare_programs', 'loan_programs', 'news_posts')
  ),
  score NUMERIC NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  applies INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 하루 1번만 snapshot (cron 중복 실행 방어)
  UNIQUE (snapshot_date, program_id)
);

-- 지난 30일 top N query 가속 (date DESC + score DESC)
CREATE INDEX IF NOT EXISTS popularity_snapshots_date_score_idx
  ON popularity_snapshots (snapshot_date DESC, score DESC);

-- 특정 program 의 추세 query 가속 (program_id + date)
CREATE INDEX IF NOT EXISTS popularity_snapshots_program_date_idx
  ON popularity_snapshots (program_id, snapshot_date DESC);

COMMENT ON TABLE popularity_snapshots IS
  'A 12차: popularity 30일 추세 학습. 매일 KST 03:00 cron 누적. autonomous hub 차트 원본.';

-- RLS — admin only (cron + service_role). 사용자는 직접 SELECT 불가.
ALTER TABLE popularity_snapshots ENABLE ROW LEVEL SECURITY;
-- policy 없음 → anon/authenticated SELECT 차단 (service_role 만 통과)
