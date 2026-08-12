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
    failReasons: Array<{ reason: string; count: number }>;
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

type RecentAuditQueryResult = {
  data: NaverExtensionStatus["recentAudits"] | null;
  error: { message?: string } | null;
};

type FailReasonRow = { error_message: string | null; skip_reason: string | null };

type RecentAuditQuery = PromiseLike<RecentAuditQueryResult> & {
  select(columns: string): RecentAuditQuery;
  eq(column: string, value: unknown): RecentAuditQuery;
  gte(column: string, value: unknown): RecentAuditQuery;
  order(column: string, options: { ascending: boolean }): RecentAuditQuery;
  limit(count: number): RecentAuditQuery;
  catch<TResult>(
    onrejected: (reason: unknown) => TResult | PromiseLike<TResult>,
  ): PromiseLike<RecentAuditQueryResult | TResult>;
};

type NaverExtensionStatusClient = {
  from(table: "naver_blog_queue" | "naver_publish_audit"): {
    select(columns: string, options: { count: "exact"; head: true }): CountQuery;
    select(columns: string): RecentAuditQuery;
  };
};

async function safeCount(
  label: string,
  query: CountQuery,
  errors: string[],
): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) {
      errors.push(`${label}: ${error.message ?? "unknown"}`);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : "unknown"}`);
    return 0;
  }
}

export function normalizeNaverFailReason(row: FailReasonRow): string {
  const raw = row.skip_reason || row.error_message || "unknown";
  const message = raw.toLowerCase();
  if (message.includes("confirm 버튼") || message.includes("confirm button")) return "confirm_not_found";
  if (message.includes("url") || message.includes("공개 글")) return "url_capture_failed";
  if (message.includes("로그인") || message.includes("cookies") || message.includes("cookie")) return "login_or_cookies";
  if (message.includes("content.js") || message.includes("executeScript") || message.includes("메시지")) return "content_script";
  if (message.includes("body") || message.includes("본문")) return "body_input";
  return String(raw).slice(0, 80) || "unknown";
}

export function summarizeFailReasons(rows: FailReasonRow[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reason = normalizeNaverFailReason(row);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5);
}

/**
 * Chrome Extension 기반 네이버 발행 상태를 읽기 전용으로 요약한다.
 * 운영자/Extension popup 에서 "큐가 막혔는지, 실패가 누적됐는지"를 빠르게 보기 위한 API backing helper.
 */
export async function getNaverExtensionStatus(): Promise<NaverExtensionStatus> {
  // Supabase query builder generics can become excessively deep in this status fan-out.
  // Keep this helper runtime-safe and type the returned payload explicitly instead.
  const admin = createAdminClient() as unknown as NaverExtensionStatusClient;
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

  let recentRes: {
    data: NaverExtensionStatus["recentAudits"] | null;
    error: { message?: string } | null;
  } = { data: null, error: null };
  let failReasonRes: {
    data: FailReasonRow[] | null;
    error: { message?: string } | null;
  } = { data: null, error: null };
  try {
    recentRes = await admin
      .from("naver_publish_audit")
      .select("attempted_at, result, error_message, skip_reason, naver_url")
      .order("attempted_at", { ascending: false })
      .limit(5);
  } catch (error) {
    recentRes = {
      data: null,
      error: { message: error instanceof Error ? error.message : "unknown" },
    };
  }
  try {
    failReasonRes = await admin
      .from("naver_publish_audit")
      .select("error_message, skip_reason")
      .eq("result", "fail")
      .gte("attempted_at", since24h)
      .limit(200) as unknown as { data: FailReasonRow[] | null; error: { message?: string } | null };
  } catch (error) {
    failReasonRes = {
      data: null,
      error: { message: error instanceof Error ? error.message : "unknown" },
    };
  }

  if (recentRes.error) {
    errors.push(`recentAudits: ${recentRes.error.message ?? "unknown"}`);
  }
  if (failReasonRes.error) {
    errors.push(`failReasons: ${failReasonRes.error.message ?? "unknown"}`);
  }
  const failReasons = summarizeFailReasons(failReasonRes.data ?? []);

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
      failReasons,
    },
    recentAudits: recentRes.data ?? [],
    errors,
  };
}
