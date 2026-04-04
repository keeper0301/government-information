-- 조회수 증가 RPC 함수
CREATE OR REPLACE FUNCTION increment_view_count(p_table_name TEXT, p_row_id UUID)
RETURNS void AS $$
BEGIN
  IF p_table_name = 'welfare_programs' THEN
    UPDATE welfare_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  ELSIF p_table_name = 'loan_programs' THEN
    UPDATE loan_programs SET view_count = view_count + 1 WHERE id = p_row_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
