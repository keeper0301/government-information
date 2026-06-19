import { createAdminClient } from "@/lib/supabase/admin";

export type NaverExtensionStatus = {
  checkedAt: string;
  queue: {
    pending: number;
    retryablePending: number;
    blockedPending: number;
    skippedExtensionFailed: number;
  };
  audit24h: {
    success: number;
    fail: number;
    skipped: number;
  };
  recentAudits: Array<{
    attempted_at: string;
    result: string;
    error_message: string | null;
    skip_reason: string | null;
    naver_url: string | null;
  }>;
  errors: string[];
};

type CountResult = { count: number | null; error: { message?: string } | null };

type CountQuery = PromiseLike<CountResult> & {
  eq(column: string, value: unknown): CountQuery;
  gte(column: string, value: unknown): CountQuery;
  lt(column: string, value: unknown): CountQuery;
};

async function safeCount(
  label: string,
  query: CountQuery,
  errors: string[],
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    errors.push(`${label}: ${error.message ?? "unknown"}`);
    return 0;
  }
  return count ?? 0;
}

/**
 * Chrome Extension 기반 네이버 발행 상태를 읽기 전용으로 요약한다.
 * 운영자/Extension popup 에서 "큐가 막혔는지, 실패가 누적됐는지"를 빠르게 보기 위한 API backing helper.
 */
export async function getNaverExtensionStatus(): Promise<NaverExtensionStatus> {
  // Supabase query builder generics can become excessively deep in this status fan-out.
  // Keep this helper runtime-safe and type the returned payload explicitly instead.
  const admin = createAdminClient() as any;
  const checkedAt = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  const [pending, retryablePending, blockedPending, skippedExtensionFailed, success, fail, skipped] =
    await Promise.all([
      safeCount(
        "queue.pending",
        admin.from("naver_blog_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        errors,
      ),
      safeCount(
        "queue.retryablePending",
        admin
          .from("naver_blog_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("attempt_count", 3),
        errors,
      ),
      safeCount(
        "queue.blockedPending",
        admin
          .from("naver_blog_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("attempt_count", 3),
        errors,
      ),
      safeCount(
        "queue.skippedExtensionFailed",
        admin
          .from("naver_blog_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "skipped")
          .eq("skip_reason", "extension_failed_3_attempts"),
        errors,
      ),
      safeCount(
        "audit24h.success",
        admin
          .from("naver_publish_audit")
          .select("id", { count: "exact", head: true })
          .eq("result", "success")
          .gte("attempted_at", since24h),
        errors,
      ),
      safeCount(
        "audit24h.fail",
        admin
          .from("naver_publish_audit")
          .select("id", { count: "exact", head: true })
          .eq("result", "fail")
          .gte("attempted_at", since24h),
        errors,
      ),
      safeCount(
        "audit24h.skipped",
        admin
          .from("naver_publish_audit")
          .select("id", { count: "exact", head: true })
          .eq("result", "skipped")
          .gte("attempted_at", since24h),
        errors,
      ),
    ]);

  const recentRes = await admin
    .from("naver_publish_audit")
    .select("attempted_at, result, error_message, skip_reason, naver_url")
    .order("attempted_at", { ascending: false })
    .limit(5);

  if (recentRes.error) {
    errors.push(`recentAudits: ${recentRes.error.message ?? "unknown"}`);
  }

  return {
    checkedAt,
    queue: {
      pending,
      retryablePending,
      blockedPending,
      skippedExtensionFailed,
    },
    audit24h: {
      success,
      fail,
      skipped,
    },
    recentAudits: (recentRes.data ?? []) as NaverExtensionStatus["recentAudits"],
    errors,
  };
}
