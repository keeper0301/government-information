-- ============================================================
-- 023: increment_view_count RPC 에 news_posts 지원 추가
-- ============================================================
-- news_posts.view_count 컬럼은 021 마이그레이션에서 추가됨.
-- 이번 갱신으로 상세 페이지 조회 시 RPC 한 번 호출해 증가 가능.
--
-- 기존 004 + 012 (search_path hardening) 합쳐서 재정의.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_view_count(p_table_name TEXT, p_row_id UUID)
RETURNS void AS $$
BEGIN
  IF p_table_name = 'welfare_programs' THEN
    UPDATE welfare_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  ELSIF p_table_name = 'loan_programs' THEN
    UPDATE loan_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  ELSIF p_table_name = 'news_posts' THEN
    UPDATE news_posts SET view_count = view_count + 1 WHERE id = p_row_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

COMMENT ON FUNCTION increment_view_count IS
  '조회수 증가 — 화이트리스트 (welfare_programs / loan_programs / news_posts).';
