import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { getNaverPostPerformanceReadback } from "@/lib/naver-blog/post-performance-readback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_RE = /^[0-9a-f]{16}$/i;

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const contentId = url.searchParams.get("contentId") ?? "";
  const queueId = url.searchParams.get("queueId") ?? "";
  const fingerprint = url.searchParams.get("fingerprint") ?? "";
  if (!UUID_RE.test(contentId) || !UUID_RE.test(queueId) || !FINGERPRINT_RE.test(fingerprint)) {
    return NextResponse.json(
      { ok: false, error: "valid contentId, queueId and 16-char hex fingerprint required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await getNaverPostPerformanceReadback({ contentId, queueId, fingerprint });
    return NextResponse.json(
      { ok: !result.rollback.required, ...result },
      { status: result.rollback.required ? 409 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "readback_failed";
    const status = /not_found|mismatch/.test(message) ? 404 : 502;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
