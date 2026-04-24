-- ============================================================
-- 023: increment_view_count RPC 에 news_posts 케이스 추가
-- ============================================================
-- 기존 RPC 는 welfare_programs / loan_programs 만 지원.
-- news_posts 조회수는 p_table_name='news_posts' 로 호출하지만 ELSIF 분기에
-- 없어 조용히 no-op → 조회수 0 고정.
-- news_posts.view_count 는 021 마이그레이션에서 이미 추가됨.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_view_count(p_table_name text, p_row_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_table_name = 'welfare_programs' THEN
    UPDATE welfare_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  ELSIF p_table_name = 'loan_programs' THEN
    UPDATE loan_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  ELSIF p_table_name = 'news_posts' THEN
    UPDATE news_posts SET view_count = view_count + 1 WHERE id = p_row_id;
  END IF;
END;
$function$;
