-- ============================================================
-- 052_drop_dead_indexes — 미사용 dead 인덱스 2개 제거
-- ============================================================
-- Supabase advisor unused_index INFO 정리 (2026-04-26 헬스체크 후속).
-- pg_stat_user_indexes 의 idx_scan=0 + 코드 사용 분석으로 진짜 dead 만 선별.
--
-- 1) idx_welfare_llm_failed_at (296KB)
--    Gemini 영구 폐기 (커밋 76ff8ab, 2026-04-24) 후 last_llm_failed_at 컬럼
--    코드 사용 0. 마이그 019 의 컬럼 자체는 보존되지만 인덱스는 dead weight.
--
-- 2) idx_news_posts_topic_categories (776KB)
--    topic_categories 컬럼 99% NULL (11295/11413). 031 마이그의 benefit_tags
--    로 검색 패턴이 대체됨. INSERT/UPDATE 는 collect-news 에서 계속되지만
--    검색 사용 X 라 GIN 인덱스 dead.
--
-- 효과: 인덱스 ~1MB 회수 + autovacuum INSERT/UPDATE 비용 절감.
-- 회귀 위험: 0 — 인덱스만 삭제, 컬럼·row 보존. 필요 시 CREATE INDEX 로 재생성.
-- ============================================================

DROP INDEX IF EXISTS public.idx_welfare_llm_failed_at;
DROP INDEX IF EXISTS public.idx_news_posts_topic_categories;
