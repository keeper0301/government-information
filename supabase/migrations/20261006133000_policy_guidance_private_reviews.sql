-- 초안과 원문 전체는 관리자 전용으로 보관하고 승인된 공개본만 정책 칸에 둔다.
CREATE TABLE IF NOT EXISTS public.policy_guidance_reviews (
  program_table text NOT NULL CHECK (program_table IN ('welfare_programs', 'loan_programs')),
  program_id uuid NOT NULL,
  guidance jsonb NOT NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (program_table, program_id)
);
ALTER TABLE public.policy_guidance_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.policy_guidance_reviews FROM anon, authenticated;
GRANT ALL ON public.policy_guidance_reviews TO service_role;

-- 같은 정책의 동시 승인·회수·자동작성을 직렬 처리해 서로 덮어쓰지 못하게 한다.
CREATE OR REPLACE FUNCTION public.save_policy_guidance_review(
  target_table text, target_id uuid, expected_updated_at timestamptz,
  expected_public jsonb, expected_revision uuid, private_guidance jsonb, published_guidance jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  current_updated_at timestamptz;
  current_public jsonb;
  current_revision uuid;
BEGIN
  IF target_table NOT IN ('welfare_programs', 'loan_programs') THEN
    RAISE EXCEPTION '지원하지 않는 정책 종류';
  END IF;
  EXECUTE format('SELECT updated_at, policy_guidance FROM public.%I WHERE id=$1 FOR UPDATE', target_table)
    INTO current_updated_at, current_public USING target_id;
  IF current_updated_at IS NULL OR current_updated_at IS DISTINCT FROM expected_updated_at
    OR current_public IS DISTINCT FROM expected_public THEN RETURN false; END IF;
  SELECT revision INTO current_revision FROM public.policy_guidance_reviews
    WHERE program_table=target_table AND program_id=target_id FOR UPDATE;
  IF current_revision IS DISTINCT FROM expected_revision THEN RETURN false; END IF;
  INSERT INTO public.policy_guidance_reviews(program_table, program_id, guidance)
    VALUES(target_table, target_id, private_guidance)
    ON CONFLICT(program_table, program_id) DO UPDATE
      SET guidance=EXCLUDED.guidance, revision=gen_random_uuid(), updated_at=now();
  EXECUTE format('UPDATE public.%I SET policy_guidance=$1 WHERE id=$2', target_table)
    USING published_guidance, target_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_policy_guidance_review(text, uuid, timestamptz, jsonb, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_policy_guidance_review(text, uuid, timestamptz, jsonb, uuid, jsonb, jsonb) TO service_role;
