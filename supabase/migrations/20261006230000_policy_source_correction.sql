-- 주소 수정 전 자료는 관리자 전용 기록에 누적 보관해 연속 수정에도 잃지 않는다.
CREATE TABLE IF NOT EXISTS public.policy_guidance_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_table text NOT NULL CHECK (program_table IN ('welfare_programs','loan_programs')),
  program_id uuid NOT NULL,
  previous_source text,
  previous_application text,
  previous_guidance jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.policy_guidance_link_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.policy_guidance_link_audit FROM anon, authenticated;
GRANT ALL ON public.policy_guidance_link_audit TO service_role;

-- 원문 수정과 이전 검수 무효화를 한 작업으로 묶어 동시 저장을 보호한다.
CREATE OR REPLACE FUNCTION public.replace_policy_guidance_link(
  target_table text, target_id uuid, expected_updated_at timestamptz,
  expected_public jsonb, expected_revision uuid, link_kind text, link_url_new text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  current_updated_at timestamptz;
  current_public jsonb;
  current_revision uuid;
  previous_source text;
  previous_application text;
  previous_guidance jsonb;
BEGIN
  IF target_table NOT IN ('welfare_programs', 'loan_programs') OR link_kind NOT IN ('source','application') THEN
    RAISE EXCEPTION '지원하지 않는 정책 종류';
  END IF;
  EXECUTE format('SELECT updated_at, policy_guidance, source_url, apply_url FROM public.%I WHERE id=$1 FOR UPDATE', target_table)
    INTO current_updated_at, current_public, previous_source, previous_application USING target_id;
  IF current_updated_at IS NULL OR current_updated_at IS DISTINCT FROM expected_updated_at
    OR current_public IS DISTINCT FROM expected_public THEN RETURN false; END IF;
  SELECT revision, guidance INTO current_revision, previous_guidance FROM public.policy_guidance_reviews
    WHERE program_table=target_table AND program_id=target_id FOR UPDATE;
  IF current_revision IS DISTINCT FROM expected_revision THEN RETURN false; END IF;
  INSERT INTO public.policy_guidance_link_audit(program_table,program_id,previous_source,previous_application,previous_guidance)
    VALUES(target_table,target_id,previous_source,previous_application,previous_guidance);
  -- 이전 설명은 관리자만 볼 수 있게 보존하되 승인 상태로 재사용하지 않는다.
  INSERT INTO public.policy_guidance_reviews(program_table, program_id, guidance)
    VALUES(target_table, target_id, jsonb_build_object('version',1,'status','needs_source',
      'previousSource',previous_source,'previousApply',previous_application,
      'previousReview',COALESCE(NULLIF(previous_guidance->'previousReview','null'::jsonb),previous_guidance)))
    ON CONFLICT(program_table, program_id) DO UPDATE
      SET guidance=EXCLUDED.guidance, revision=gen_random_uuid(), updated_at=now();
  EXECUTE format('UPDATE public.%I SET %I=$1, policy_guidance=$2 WHERE id=$3', target_table,
    CASE WHEN link_kind='source' THEN 'source_url' ELSE 'apply_url' END)
    USING link_url_new, '{"version":1,"status":"needs_source"}'::jsonb, target_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_policy_guidance_link(text, uuid, timestamptz, jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_policy_guidance_link(text, uuid, timestamptz, jsonb, uuid, text, text) TO service_role;
