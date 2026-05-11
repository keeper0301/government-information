-- ============================================================
-- 085 정책 unique_insight 백필 인덱스 v2 (cron ORDER BY 일치)
-- ============================================================
-- 2026-05-11 발견: 083 마이그레이션이 만든 partial 인덱스 (updated_at DESC) 가
-- backfill cron 의 실제 ORDER BY 와 불일치.
--
-- cron (/api/cron/policy-insight-backfill, route.ts:80~83) ORDER BY:
--   view_count DESC NULLS LAST → published_at DESC NULLS LAST
--   (인기 정책 → 최신 정책 순서로 검수자 hit 확률 ↑)
--
-- v1 인덱스는 dead — Postgres 가 ORDER BY 만족 못 시켜서 sort 별도 수행.
-- v2 인덱스 추가로 memory sort 제거. partial index (unique_insight IS NULL)
-- 라 NULL row 만 포함 — 백필 진행 따라 인덱스 자동 축소.
--
-- v1 (idx_welfare/loan_insight_backfill) 는 일단 유지 — 부담 작고,
-- 다른 쿼리가 쓸 수도 있음. dead 확정 후 별도 마이그레이션에서 정리.
-- ============================================================

-- welfare_programs: view_count + published_at 기준 백필 인덱스
CREATE INDEX IF NOT EXISTS idx_welfare_insight_backfill_v2
  ON welfare_programs (view_count DESC NULLS LAST, published_at DESC NULLS LAST)
  WHERE unique_insight IS NULL;

-- loan_programs: 동일 패턴
CREATE INDEX IF NOT EXISTS idx_loan_insight_backfill_v2
  ON loan_programs (view_count DESC NULLS LAST, published_at DESC NULLS LAST)
  WHERE unique_insight IS NULL;

COMMENT ON INDEX idx_welfare_insight_backfill_v2 IS
  'policy-insight-backfill cron 의 ORDER BY (view_count, published_at) 매칭. partial: unique_insight IS NULL';
COMMENT ON INDEX idx_loan_insight_backfill_v2 IS
  'policy-insight-backfill cron 의 ORDER BY (view_count, published_at) 매칭. partial: unique_insight IS NULL';
