// ============================================================
// /api/cron/apply-business-profile-ddl112 — one-shot production DDL 112 apply
// ============================================================
// Hardcoded, CRON_SECRET-protected migration executor for the approved DDL only.
// This route intentionally does not accept arbitrary SQL.
// Remove after production apply verification.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

type QueryResponse = unknown;

const DDL_112_SQL = `
REVOKE INSERT, UPDATE, DELETE ON public.business_profiles FROM authenticated;

COMMENT ON TABLE public.business_profiles IS
  '자영업자/소상공인 내 가게 프로필. Basic 이상 유료 기능 입력값이며 쓰기는 /api/business-profile 서버 티어 게이트를 통해서만 허용.';
`;

const VERIFY_SQL = `
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'business_profiles'
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY privilege_type;
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

  const apply = await runManagementQuery(projectRef, token, DDL_112_SQL);
  if (typeof apply === 'object' && apply && 'ok' in apply && apply.ok === false) {
    return NextResponse.json({ applied: false, apply }, { status: 502 });
  }

  const verify = await runManagementQuery(projectRef, token, VERIFY_SQL);
  return NextResponse.json({ applied: true, verify });
}
