"use server";

// ============================================================
// /admin/naver-blog/manual-test — server action
// ============================================================
// 사장님이 cookies upload 후 1건 manual 검증.
// dry-run = 발행 직전까지만 (selector·iframe 검증) → cron 활성화 전 안전.
// ============================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { getActiveCookies } from "@/lib/naver-blog/cookies-vault";
import { listPendingNaverQueue, markNaverPublished } from "@/lib/naver-blog/queue";
import { convertToNaverBlogHtml } from "@/lib/naver-blog/format";
import { publishToNaverBlog } from "@/lib/naver-blog/publisher";
import { logPublishAudit } from "@/lib/naver-blog/audit";

async function requireAdminUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    throw new Error("권한 없음");
  }
  return user.id;
}

export type ManualTestResult =
  | { ok: true; dryRun: boolean; naverUrl: string | null; details: Record<string, unknown> }
  | { ok: false; error: string; reason: string; details: Record<string, unknown> };

export async function runManualPublishAction(
  formData: FormData,
): Promise<ManualTestResult> {
  try {
    const actorId = await requireAdminUserId();
    const queueId = formData.get("queue_id");
    const dryRun = formData.get("dry_run") === "1";

    if (typeof queueId !== "string" || queueId.length === 0) {
      return failPlain("queue_id 누락");
    }

    // 1) cookies 확인
    const cookies = await getActiveCookies();
    if (!cookies) {
      return failPlain("저장된 cookies 없음. 먼저 /admin/naver-blog/cookies 에서 업로드.");
    }

    // 2) 큐 row 조회 (페이지가 미리 listPending 한 결과 활용 어려워 — 단건 재조회)
    const pending = await listPendingNaverQueue(50);
    const row = pending.find((r) => r.id === queueId);
    if (!row) {
      return failPlain("pending 큐에 해당 ID 없음. 새로고침 후 다시 시도.");
    }

    // 3) SE3 HTML 변환
    const payload = convertToNaverBlogHtml(row.blog_post);

    // 4) Playwright 발행 (dry-run 또는 실제)
    const result = await publishToNaverBlog({
      title: payload.title,
      bodyHtml: payload.bodyHtml,
      cookies: cookies.cookies,
      dryRun,
    });

    // 5) audit logging
    if (result.ok) {
      await logPublishAudit({
        postId: row.blog_post_id,
        result: dryRun ? "skipped" : "success",
        naverUrl: result.naverUrl,
        skipReason: dryRun ? null : null,
        details: { ...result.details, manual_test: true, dry_run: dryRun },
      });

      // dry-run 이 아니면 큐 도 발행 완료 처리
      if (!dryRun) {
        await markNaverPublished(queueId, actorId, result.naverUrl);
      }
    } else {
      await logPublishAudit({
        postId: row.blog_post_id,
        result: "fail",
        errorMessage: result.error,
        details: { ...result.details, manual_test: true, dry_run: dryRun, reason: result.reason },
      });
    }

    // 6) admin audit
    try {
      await logAdminAction({
        actorId,
        action: "naver_manual_test",
        details: {
          queue_id: queueId,
          dry_run: dryRun,
          ok: result.ok,
          reason: result.ok ? null : result.reason,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath("/admin/naver-blog/manual-test");

    if (result.ok) {
      return { ok: true, dryRun, naverUrl: result.naverUrl, details: result.details };
    }
    return { ok: false, error: result.error, reason: result.reason, details: result.details };
  } catch (err) {
    return failPlain(err instanceof Error ? err.message : String(err));
  }
}

function failPlain(msg: string): ManualTestResult {
  return { ok: false, error: msg, reason: "precondition", details: {} };
}
