// ============================================================
// /api/naver-extension/published — Extension 발행 결과 보고
// ============================================================
// Extension 의 content.js 가 발행 성공·실패·skip 시 호출.
// audit row insert + 큐 status update.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { logPublishAudit, pickAuditDetails, type AuditSkipReason } from "@/lib/naver-blog/audit";
import { authorizeNaverExtensionRequest } from "@/lib/naver-extension-auth";

export const dynamic = "force-dynamic";
// safeKeyEqual(node:crypto) 사용 — Edge runtime 미지원이므로 명시.
export const runtime = "nodejs";
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

// audit details — lib/naver-blog/audit.ts 의 AUDIT_SAFE_KEYS single source 사용 (W3 fix)
function sanitizeDetails(d: Record<string, unknown> | null | undefined) {
  const picked = pickAuditDetails(d ?? null);
  if (picked) picked.runner = "chrome-extension";
  return picked;
}

export async function POST(request: Request) {
  const denied = authorizeNaverExtensionRequest(request);
  if (denied) return denied;

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
  await logAdminAction({
    actorId: null,
    action: "naver_extension_publish",
    details: {
      queue_id: body.queueId,
      blog_post_id: body.blogPostId ?? null,
      result: body.result,
      has_naver_url: Boolean(body.naverUrl),
      skip_reason: body.skipReason ?? null,
    },
  }).catch(() => undefined);

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
    const { data: current } = await admin
      .from("naver_blog_queue")
      .select("attempt_count")
      .eq("id", body.queueId)
      .maybeSingle();
    const nextAttemptCount = Math.max(0, Number(current?.attempt_count ?? 0)) + 1;
    const reachedRetryLimit = nextAttemptCount >= 3;

    await admin
      .from("naver_blog_queue")
      .update({
        attempt_count: nextAttemptCount,
        last_error: body.errorMessage ?? "fail",
        ...(reachedRetryLimit
          ? {
              status: "skipped",
              skipped_at: new Date().toISOString(),
              skip_reason: "extension_failed_3_attempts",
            }
          : {}),
      })
      .eq("id", body.queueId);
  }
  // skipped 는 큐 status 변경 안 함

  return NextResponse.json({ ok: true });
}
