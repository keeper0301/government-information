-- ============================================================
-- 009: cron 실패 알림 dedupe 테이블
-- ============================================================
-- 같은 에러가 24시간 안에 반복되면 메일 한 번만 보내고,
-- 나머지는 occurrences 만 증가시켜 메일 폭주 방지.
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_failure_log (
  id BIGSERIAL PRIMARY KEY,

  -- 어떤 cron 이 실패했는지 (예: "publish-blog", "collect[fsc]")
  job_name TEXT NOT NULL,

  -- 같은 에러를 식별하는 키 — 에러 메시지를 정규화한 후 SHA1 해시.
  -- (job_name, signature) 조합으로 같은 에러인지 판단.
  signature TEXT NOT NULL,

  -- 원본 에러 메시지 (운영자가 본문에서 확인 가능)
  error_message TEXT NOT NULL,

  -- 추가 컨텍스트 (예: 카테고리·source 등)
  context TEXT,

  -- 처음 본 시각 — 쭉 유지
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 가장 최근에 본 시각 — 동일 에러가 다시 들어오면 갱신
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 누적 발생 횟수 (메일 발송 여부와 무관)
  occurrences INT NOT NULL DEFAULT 1,

  -- 마지막으로 메일을 실제로 보낸 시각.
  -- NOW() - notified_at < 24h 면 다시는 메일 안 보냄.
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- (job_name, signature) 는 unique — UPSERT 로 안전하게 누적
  UNIQUE (job_name, signature)
);

-- 같은 에러 조회 + 시간 비교 가속
CREATE INDEX IF NOT EXISTS cron_failure_log_recent
  ON cron_failure_log (job_name, signature, notified_at DESC);

-- 운영자가 최근 실패 모아보기
CREATE INDEX IF NOT EXISTS cron_failure_log_last_seen
  ON cron_failure_log (last_seen_at DESC);

COMMENT ON TABLE cron_failure_log IS
  'cron 실패 알림 dedupe — 같은 (job, signature) 24시간 내 반복 시 메일 스킵';
