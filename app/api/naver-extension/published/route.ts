// ============================================================
// /api/naver-extension/published — Extension 발행 결과 보고
// ============================================================
// Extension 의 content.js 가 발행 성공·실패·skip 시 호출.
// audit row insert + 큐 status update.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPublishAudit, type AuditSkipReason } from "@/lib/naver-blog/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

type Body = {
  queueId?: string;
  blogPostId?: string | null;
  result?: "success" | "fail" | "skipped";
  naverUrl?: string | null;
  errorMessage?: string | null;
  skipReason?: AuditSkipReason | null;
  details?: Record<string, unknown> | null;
};

// audit details 안전 whitelist (cookies·secret 안 흘림)
const SAFE_KEYS = new Set([
  "stage", "title", "body", "restore_modal_dismissed",
  "cover_pasted", "cover_failed", "main_publish", "confirm_publish",
  "url_captured", "kstHour", "queueId",
]);
function sanitizeDetails(d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (SAFE_KEYS.has(k)) out[k] = v;
  }
  out.runner = "chrome-extension";
  return out;
}

export async function POST(request: Request) {
  const secret = process.env.NAVER_EXTENSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NAVER_EXTENSION_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.queueId || !body.result) {
    return NextResponse.json({ error: "queueId + result required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // audit
  await logPublishAudit({
    postId: body.blogPostId ?? null,
    result: body.result,
    naverUrl: body.naverUrl ?? null,
    errorMessage: body.errorMessage ?? null,
    skipReason: body.skipReason ?? null,
    details: sanitizeDetails(body.details),
  });

  // 큐 update
  if (body.result === "success") {
    await admin
      .from("naver_blog_queue")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        naver_url: body.naverUrl ?? null,
        last_error: null,
      })
      .eq("id", body.queueId);
  } else if (body.result === "fail") {
    await admin
      .from("naver_blog_queue")
      .update({ last_error: body.errorMessage ?? "fail" })
      .eq("id", body.queueId);
  }
  // skipped 는 큐 status 변경 안 함

  return NextResponse.json({ ok: true });
}
