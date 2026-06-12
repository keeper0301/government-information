-- 113 검색 속도 최적화 — 제목 트라이그램 + keywords GIN (자동완성 ~1s→200~300ms)
-- ============================================================
-- 배경: lib/search.ts 가 4개 테이블(복지·대출·뉴스·블로그)을 Promise.all 병렬 조회하나,
--   각 컬럼이 `title ILIKE '%토큰%'` 처럼 앞 와일드카드라 일반 B-tree 인덱스를 못 쓰고
--   전체 스캔 → 정상상태 ~1s(콜드 2.5s). 병렬이라 전체 시간 = 가장 느린 테이블(뉴스 26K).
--
-- 해결: pg_trgm 트라이그램 GIN 인덱스를 검색 컬럼(제목)에 부여 → `%토큰%` ILIKE 가 인덱스 사용.
--   "가벼운 버전"(사장님 선택 2026-06-13): 검색을 제목 + keywords 로 좁히고 그 둘만 인덱스.
--   (설명/카테고리/요약 ILIKE 제외 — keywords 가 LLM 추출 검색어라 recall 보완. 비용·쓰기부담 ↓)
--
-- keywords GIN 재생성 주의: 110_drop_unused_keywords_gin 이 idx_welfare/loan_keywords_gin 을
--   "미사용(idx_scan 0)"으로 삭제했음. 당시엔 검색 OR 에 인덱스 없는 컬럼(설명 ILIKE 등)이
--   섞여 풀스캔 → 플래너가 keywords GIN 을 쓸 이유가 없었기 때문(OR 의 모든 컬럼이 인덱스여야
--   bitmap OR 사용). 이번에 검색을 title+keywords 로 좁혀 둘 다 인덱스 → keywords GIN 실사용됨.
--   110 주석(line 9) "미래 keywords gin 검색 필요 시 재생성" 예고대로 복구.
--
-- 비용: 트라이그램 4 + keywords GIN 2 = 6 인덱스, 약 ~50MB. 빌드 중 짧은 쓰기 락(테이블별 수초).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 제목 트라이그램 — `title ILIKE '%토큰%'` 인덱스 사용 (4개 테이블 모두: 병렬 max 병목 해소)
CREATE INDEX IF NOT EXISTS idx_welfare_title_trgm
  ON public.welfare_programs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_loan_title_trgm
  ON public.loan_programs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_news_title_trgm
  ON public.news_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blog_title_trgm
  ON public.blog_posts USING gin (title gin_trgm_ops);

-- keywords GIN 재생성 (복지·대출만 — 검색이 keywords.cs.{토큰} 사용. 110 에서 drop 후 복구)
CREATE INDEX IF NOT EXISTS idx_welfare_keywords_gin
  ON public.welfare_programs USING gin (keywords);
CREATE INDEX IF NOT EXISTS idx_loan_keywords_gin
  ON public.loan_programs USING gin (keywords);
