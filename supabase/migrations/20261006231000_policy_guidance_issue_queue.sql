-- 관리자만 원문 미확인·신청 홈페이지 자료를 좁혀 읽는다. 목록 판정은 사실 검수가 아니다.
CREATE OR REPLACE FUNCTION public.policy_guidance_issue_queue(
  target_table text, issue_kind text, search_text text DEFAULT '', page_number integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF target_table NOT IN ('welfare_programs', 'loan_programs')
    OR issue_kind NOT IN ('source', 'application')
    OR page_number < 0 OR page_number > 10000 OR length(search_text) > 100 THEN
    RAISE EXCEPTION '검색 조건을 확인하세요';
  END IF;
  EXECUTE format($query$
    WITH filtered AS (
      SELECT id, title, source_url, apply_url, policy_guidance FROM public.%I
      WHERE position(lower($1) in lower(title)) > 0
        AND CASE WHEN $2='application' THEN
          apply_url ~* '^https?://[^/?#]+/?$'
        ELSE source_url IS NULL OR source_url !~* '^https?://[^/]+\.(go|gov|or|re)\.kr/'
          OR source_url ~* '^https?://[^/?#]+/?$'
          OR source_url ~* '\.(do|jsp|asp|aspx)$' END
    ), selected AS (SELECT * FROM filtered ORDER BY id LIMIT 20 OFFSET $3)
    SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(selected)) FROM selected),'[]'::jsonb),
      'total',(SELECT count(*) FROM filtered),'page',$4)
  $query$, target_table) INTO result USING search_text, issue_kind, page_number*20, page_number;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.policy_guidance_issue_queue(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_guidance_issue_queue(text, text, text, integer) TO service_role;
