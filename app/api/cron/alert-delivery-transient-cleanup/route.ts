import { NextResponse } from "next/server";

import { safeKeyEqual } from "@/lib/safe-key-equal";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSIENT_KAKAO_SKIP_ERRORS = [
  "consent_missing",
  "quiet_hours_kst",
  "kakao_provider_not_configured",
] as const;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  return Boolean(expected && token && safeKeyEqual(token, expected));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .from("alert_deliveries")
    .delete({ count: "exact" })
    .eq("channel", "kakao")
    .eq("status", "skipped")
    .in("error", [...TRANSIENT_KAKAO_SKIP_ERRORS]);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: count ?? 0,
    transientErrors: TRANSIENT_KAKAO_SKIP_ERRORS,
  });
}
