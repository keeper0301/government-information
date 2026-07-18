// ============================================================
// /api/cron/apply-feature-usage-ddl117 — one-shot production DDL 117 apply
// ============================================================
// Hardcoded, CRON_SECRET-protected migration executor for the approved DDL only.
// This route intentionally does not accept arbitrary SQL.
// Remove after production apply verification.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

type QueryResponse = unknown;

const DDL_117_SQL = `
CREATE TABLE IF NOT EXISTS public.feature_usage_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('ai_chat', 'recommend')),
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, date)
);

COMMENT ON TABLE public.feature_usage_log IS
  '기능별 일일 사용량 추적. ai_chat: 무료/베이직 5회/일, recommend: 무료 5회/일. 유료 무제한 티어는 카운터 미증가.';
COMMENT ON COLUMN public.feature_usage_log.feature IS
  '사용량 제한 대상 기능. ai_chat 또는 recommend.';

CREATE OR REPLACE FUNCTION public.increment_feature_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_feature NOT IN ('ai_chat', 'recommend') THEN
    RAISE EXCEPTION 'invalid feature: %', p_feature USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feature_usage_log (user_id, feature, date, count, updated_at)
  VALUES (p_user_id, p_feature, p_date, 1, now())
  ON CONFLICT (user_id, feature, date) DO UPDATE
    SET count = public.feature_usage_log.count + 1,
        updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) TO service_role;

ALTER TABLE public.feature_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_usage_self_select ON public.feature_usage_log;
CREATE POLICY feature_usage_self_select ON public.feature_usage_log
  FOR SELECT USING ((select auth.uid()) = user_id);

INSERT INTO public.feature_usage_log (user_id, feature, date, count, updated_at)
SELECT user_id, 'ai_chat', date, count, updated_at
FROM public.ai_usage_log
ON CONFLICT (user_id, feature, date) DO UPDATE
  SET count = GREATEST(public.feature_usage_log.count, EXCLUDED.count),
      updated_at = GREATEST(public.feature_usage_log.updated_at, EXCLUDED.updated_at);
`;

const VERIFY_SQL = `
WITH table_info AS (
  SELECT
    to_regclass('public.feature_usage_log') IS NOT NULL AS table_exists,
    COALESCE((
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.feature_usage_log'::regclass
    ), false) AS rls_enabled
), function_info AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'increment_feature_usage'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_feature text, p_date date'
  ) AS function_exists
), service_role_grant AS (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'increment_feature_usage'
      AND grantee = 'service_role'
      AND privilege_type = 'EXECUTE'
  ) AS service_role_can_execute
), public_grant AS (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'increment_feature_usage'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) AS public_or_client_can_execute
), policy_info AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feature_usage_log'
      AND policyname = 'feature_usage_self_select'
  ) AS self_select_policy_exists
)
SELECT *
FROM table_info, function_info, service_role_grant, public_grant, policy_info;
`;

function getProjectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

async function runManagementQuery(projectRef: string, token: string, query: string): Promise<QueryResponse> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text body
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: typeof body === 'string' ? body.slice(0, 300) : body,
    };
  }

  return { ok: true, status: res.status, body };
}

function verificationPassed(verify: QueryResponse): boolean {
  if (typeof verify !== 'object' || !verify || !('ok' in verify) || verify.ok !== true) return false;
  const body = 'body' in verify ? verify.body : null;
  const first = Array.isArray(body) ? body[0] : null;
  return Boolean(
    first &&
      first.table_exists === true &&
      first.rls_enabled === true &&
      first.function_exists === true &&
      first.service_role_can_execute === true &&
      first.public_or_client_can_execute === false &&
      first.self_select_policy_exists === true,
  );
}

export async function POST(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const token = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN?.trim();
  const projectRef = getProjectRef();
  if (!token || !projectRef) {
    return NextResponse.json(
      { error: 'SUPABASE_PERSONAL_ACCESS_TOKEN 또는 project ref 가 없습니다.' },
      { status: 500 },
    );
  }

  const apply = await runManagementQuery(projectRef, token, DDL_117_SQL);
  if (typeof apply === 'object' && apply && 'ok' in apply && apply.ok === false) {
    return NextResponse.json({ applied: false, apply }, { status: 502 });
  }

  const verify = await runManagementQuery(projectRef, token, VERIFY_SQL);
  return NextResponse.json({ applied: true, verify, verified: verificationPassed(verify) });
}
