// ============================================================
// /api/cron/apply-user-bookmarks-ddl118 — one-shot production DDL 118 apply
// ============================================================
// Hardcoded, CRON_SECRET-protected migration executor for the approved DDL only.
// This route intentionally does not accept arbitrary SQL.
// Remove after production apply verification.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

type QueryResponse = unknown;

const DDL_118_SQL = `
CREATE OR REPLACE FUNCTION public.user_has_active_paid_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.tier IN ('basic', 'pro')
      AND s.status <> 'pending'
      AND (
        s.status <> 'cancelled'
        OR COALESCE(s.current_period_end, '-infinity'::timestamptz) >= now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_active_paid_subscription(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_active_paid_subscription(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_active_paid_subscription(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_user_bookmarks_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = '23502';
  END IF;

  IF public.user_has_active_paid_subscription(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO existing_count
  FROM public.user_bookmarks ub
  WHERE ub.user_id = NEW.user_id;

  IF existing_count >= 5 THEN
    RAISE EXCEPTION 'free_bookmark_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_bookmarks_plan_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_user_bookmarks_plan_limit() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_user_bookmarks_plan_limit() TO service_role;

DROP TRIGGER IF EXISTS user_bookmarks_plan_limit_before_insert ON public.user_bookmarks;
CREATE TRIGGER user_bookmarks_plan_limit_before_insert
  BEFORE INSERT ON public.user_bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_bookmarks_plan_limit();

COMMENT ON FUNCTION public.enforce_user_bookmarks_plan_limit() IS
  '무료 사용자는 관심 정책 5건까지만 저장. Basic/Pro 유효 구독자는 무제한. 클라이언트 직접 insert 우회 방어.';
COMMENT ON TABLE public.user_bookmarks IS
  '사용자 북마크 (찜한 정책). 무료 5건 제한은 enforce_user_bookmarks_plan_limit trigger 로 DB 계층에서도 강제.';
`;

const VERIFY_SQL = `
WITH trigger_info AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_bookmarks'
      AND t.tgname = 'user_bookmarks_plan_limit_before_insert'
      AND NOT t.tgisinternal
  ) AS trigger_exists
), function_info AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'user_has_active_paid_subscription'
        AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
    ) AS paid_helper_exists,
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'enforce_user_bookmarks_plan_limit'
        AND pg_get_function_identity_arguments(p.oid) = ''
    ) AS trigger_function_exists
), client_grants AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN ('user_has_active_paid_subscription', 'enforce_user_bookmarks_plan_limit')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
        AND privilege_type = 'EXECUTE'
    ) AS public_or_client_can_execute
), service_grants AS (
  SELECT COUNT(*) = 2 AS service_role_can_execute_both
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('user_has_active_paid_subscription', 'enforce_user_bookmarks_plan_limit')
    AND grantee = 'service_role'
    AND privilege_type = 'EXECUTE'
)
SELECT *
FROM trigger_info, function_info, client_grants, service_grants;
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
      first.trigger_exists === true &&
      first.paid_helper_exists === true &&
      first.trigger_function_exists === true &&
      first.public_or_client_can_execute === false &&
      first.service_role_can_execute_both === true,
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

  const apply = await runManagementQuery(projectRef, token, DDL_118_SQL);
  if (typeof apply === 'object' && apply && 'ok' in apply && apply.ok === false) {
    return NextResponse.json({ applied: false, apply }, { status: 502 });
  }

  const verify = await runManagementQuery(projectRef, token, VERIFY_SQL);
  return NextResponse.json({ applied: true, verify, verified: verificationPassed(verify) });
}
