-- 037_category_count_rpcs.sql
-- 카테고리 카운트 RPC 3종 — welfare/loan/news/blog 페이지의 칩 동적 노출용.
-- 기존: lib/category-counts.ts 가 row 전체 fetch 후 메모리 집계 (welfare ~10K · news ~20K)
-- 개선: DB 에서 GROUP BY 후 N rows 만 반환. 페이로드 600KB → 1KB, 응답 50~150ms 단축.
--
-- 모든 함수는 STABLE — 같은 호출이면 같은 결과 (트랜잭션 내 캐시 가능).
-- ROLLBACK: DROP FUNCTION welfare_category_counts/loan_category_counts/news_benefit_tag_counts/blog_category_counts;

-- ─────────────────────────────────────────────────────────────
-- welfare_programs: 활성 정책(apply_end >= today 또는 NULL)만 카운트
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION welfare_category_counts()
RETURNS TABLE(category TEXT, n BIGINT) AS $$
  SELECT category, COUNT(*) AS n
  FROM welfare_programs
  WHERE category IS NOT NULL
    AND (apply_end >= CURRENT_DATE OR apply_end IS NULL)
  GROUP BY category
  ORDER BY n DESC;
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────────────
-- loan_programs: apply_end 컬럼 없음 → 전체 카운트
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loan_category_counts()
RETURNS TABLE(category TEXT, n BIGINT) AS $$
  SELECT category, COUNT(*) AS n
  FROM loan_programs
  WHERE category IS NOT NULL
  GROUP BY category
  ORDER BY n DESC;
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────────────
-- news_posts.benefit_tags (배열 컬럼) unnest GROUP BY. press 제외.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION news_benefit_tag_counts()
RETURNS TABLE(category TEXT, n BIGINT) AS $$
  SELECT unnest(benefit_tags) AS category, COUNT(*) AS n
  FROM news_posts
  WHERE category != 'press'
    AND benefit_tags IS NOT NULL
  GROUP BY 1
  ORDER BY n DESC;
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────────────
-- blog_posts.category — published_at IS NOT NULL 만
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION blog_category_counts()
RETURNS TABLE(category TEXT, n BIGINT) AS $$
  SELECT category, COUNT(*) AS n
  FROM blog_posts
  WHERE category IS NOT NULL
    AND published_at IS NOT NULL
  GROUP BY category
  ORDER BY n DESC;
$$ LANGUAGE sql STABLE;
