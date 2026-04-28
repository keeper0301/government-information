// app/api/admin/cron-retry/route.ts
// Phase 6 — admin 본인이 실패한 cron 을 즉시 재실행하는 server-side endpoint.
// /admin/cron-failures 의 retry 버튼이 호출.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 실행 가능한 cron path 화이트리스트 — 임의 path 호출 차단.
const ALLOWED_PATHS = new Set<string>([
  "/api/collect-news",
  "/api/cron/health-alert",
  "/api/alert-dispatch",
  "/api/cleanup",
  "/api/finalize-deletions",
  "/api/enrich",
  "/api/billing/charge",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    cronPath?: string;
  } | null;
  const cronPath = body?.cronPath;
  if (!cronPath || !ALLOWED_PATHS.has(cronPath)) {
    return NextResponse.json(
      { error: `invalid cronPath: ${cronPath ?? "(missing)"}` },
      { status: 400 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  // internal fetch — same-origin, server side
  const url = new URL(cronPath, request.url);
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `fetch error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
  const elapsedMs = Date.now() - start;
  const data = await res.json().catch(() => null);

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    elapsedMs,
    cronPath,
    data,
  });
}
