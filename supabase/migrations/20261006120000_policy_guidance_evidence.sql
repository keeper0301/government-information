-- 자동 설명과 사람이 원문을 검수한 설명을 구분한다. 기존 내용은 보존한다.
ALTER TABLE public.welfare_programs ADD COLUMN IF NOT EXISTS policy_guidance jsonb;
ALTER TABLE public.loan_programs ADD COLUMN IF NOT EXISTS policy_guidance jsonb;
COMMENT ON COLUMN public.welfare_programs.policy_guidance IS '원문 근거·초안·검수 기록·변경 감지 값';
COMMENT ON COLUMN public.loan_programs.policy_guidance IS '원문 근거·초안·검수 기록·변경 감지 값';
