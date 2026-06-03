-- 110 unused index 정리 — keywords_gin 제거 (검색 미사용 3중 확인)
-- ============================================================
-- idx_welfare_keywords_gin(432KB)·idx_loan_keywords_gin(64KB) = welfare/loan keywords 컬럼 gin.
-- 미사용 3중 확인:
--   ① idx_scan 0 (stats_reset NULL = 계정 이래 누적 통계라 신뢰 가능)
--   ② lib 검색 = target/description ILIKE (news-matching.ts) — keywords @@ 검색 없음
--   ③ app 필터 = household_target_tags / age_tags 의 .contains — keywords gin 미사용
-- → 496KB 회수 + advisor unused_index 2건 해소.
-- keywords 컬럼 자체는 enrich(policy-enrich)가 채우므로 유지. 미래 keywords gin 검색이
-- 필요해지면 CREATE INDEX 로 재생성하면 됨(되돌리기 쉬움).
-- (작은 partial index 16KB 다수는 조건부 쿼리 미래 가능성 + 실익 미미로 이번 보류.)
-- ============================================================

DROP INDEX IF EXISTS public.idx_welfare_keywords_gin;
DROP INDEX IF EXISTS public.idx_loan_keywords_gin;
