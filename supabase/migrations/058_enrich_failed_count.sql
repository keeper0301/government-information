-- ============================================================
-- 058: enrich Detail API 영구 skip (실패 횟수 누적 + 임계값)
-- ============================================================
-- 배경:
--   2026-04-26 ~04-27 enrich 알림 폭주 사고 후속.
--   bokjiro Detail API 가 일부 servId (예: 만료·옛 공고) 에 일관 실패 응답 →
--   기존 1d cooldown (사고 hot-fix 로 7d 로 확장) 만으로는 무한 재시도 구조.
--   매주 220건 × 외부 호출 낭비 + cron_failure_log occurrences 누적.
--
--   진짜 근본 fix:
--     - detail_failed_count 누적
--     - 임계값 (3회) 도달 시 detail_permanently_skipped_at=now() 도장
--     - picker 가 detail_permanently_skipped_at IS NULL 만 후보로
--     - 외부 API 회복 시 /admin/enrich-detail 의 [영구 skip 해제] 버튼으로 일괄 reset
--
-- 컬럼 신설:
--   - detail_failed_count integer DEFAULT 0 NOT NULL
--     · 성공 시 0 으로 reset, 실패 시 +1
--   - detail_permanently_skipped_at timestamptz NULL
--     · NULL 이면 후보 자격 보존, NOT NULL 이면 picker 가 즉시 제외
--
-- 데이터 영향:
--   기존 220건 (bokjiro 실패 누적) 은 NOT NULL DEFAULT 0 으로 0 으로 채워짐.
--   추후 cron 부터 정상 카운팅 시작 — 즉 이번 마이그레이션은 데이터 손실 0,
--   회귀 0. 영구 skip 효과는 다음 cron 부터 점진 적용.
-- ============================================================

-- welfare_programs
ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS detail_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detail_permanently_skipped_at timestamptz;

COMMENT ON COLUMN public.welfare_programs.detail_failed_count
  IS 'Detail API 연속 실패 횟수. 성공 시 0 으로 reset. 임계값(3) 도달 시 detail_permanently_skipped_at 자동 도장.';
COMMENT ON COLUMN public.welfare_programs.detail_permanently_skipped_at
  IS 'Detail API 영구 skip 도장 시각. NOT NULL 이면 picker 가 후보에서 즉시 제외. /admin/enrich-detail 에서 일괄 reset 가능.';

-- loan_programs
ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS detail_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detail_permanently_skipped_at timestamptz;

COMMENT ON COLUMN public.loan_programs.detail_failed_count
  IS 'Detail API 연속 실패 횟수. 성공 시 0 으로 reset. 임계값(3) 도달 시 detail_permanently_skipped_at 자동 도장.';
COMMENT ON COLUMN public.loan_programs.detail_permanently_skipped_at
  IS 'Detail API 영구 skip 도장 시각. NOT NULL 이면 picker 가 후보에서 즉시 제외. /admin/enrich-detail 에서 일괄 reset 가능.';

-- 인덱스: picker 가 .is.null 필터에 쓸 부분 인덱스.
-- NOT NULL 인 row 만 인덱스 항목 갖고, NULL row 는 인덱스 미사용 (정상).
-- 하지만 picker 는 NULL 만 보므로 부분 인덱스로는 커버 불가 → 일반 인덱스로.
-- 다만 영구 skip 된 row 는 소수 예상 (220건 / 11,755건 = 1.9%) 이라
-- 인덱스 카디널리티 낮음. 추가 인덱스 비용 vs 효과 검토 결과:
--   · picker 쿼리가 source_code IN (...) AND last_detail_fetched_at NULLS FIRST 정렬로
--     이미 idx_welfare_detail_fetched_at 사용 중
--   · permanently_skipped_at IS NULL 필터는 단순 NULL 체크 → 추가 인덱스 불필요
-- 결론: 인덱스 신설 안 함 (autovacuum 비용 절감, advisor 회귀 0).
