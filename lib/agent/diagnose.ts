// ============================================================
// Agent diagnose — 사전 정의 사고 진단 query set (Phase 6 W0)
// ============================================================
// sidecar Codex 가 사고 의심 시 호출. read-only DB query 모음.
//
// W0 설계 원칙:
//   - 자유 쿼리 X (SQL injection 위험 + agent-policy 우회 위험)
//   - 사전 정의 question_id 만 — 사장님이 추가/제거 명시적
//   - 모든 출력 JSON serializable (Codex prompt 바로 가능)
//   - 응답 ≤ 50 KB (Codex context window 부담 ↓)
//
// 질문 추가 패턴:
//   1. QUESTION_HANDLERS 에 새 entry 추가
//   2. 단위 테스트 추가
//   3. spec doc 갱신
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type DiagnoseQuestion =
  | "health_overview"          // 사이트 가동·cron 실패 24h
  | "cron_recent_24h"           // 최근 24h cron audit 합계
  | "news_freshness"            // news_posts published_at 최신 + count by day
  | "press_tier_status"         // press tier mid/low 적체
  | "llm_spending_28d"          // 28일 LLM 추정 비용 (G4 reuse)
  | "blog_publish_status"       // 블로그 작성/발행 정상 가동 여부
  | "instagram_legacy_publish_status" // legacy 3-card ImageResponse Instagram pipeline 상태
  | "sms_delivery_24h"          // daily-digest / external-console-check 발송 결과
  | "agent_recent_actions"      // agent_execute_run 최근 50건 (Codex 본인 행동 점검)
  | "alert_recent_24h"          // health-alert 발화 추세
  | "db_table_sizes"            // 5/19 추가 — 큰 테이블 row count (storage growth 추적)
  | "rate_limit_status"         // public endpoint fixed-window rate limit top buckets
  | "local_press_collector_health"; // 23 GHA collector 고장 감지 + 수리 제안 (자가치유 감지 확장)

export type DiagnoseResult = {
  question: DiagnoseQuestion;
  data: unknown;
  collected_at: string;
};

type CronFailureRow = {
  job_name?: string | null;
  occurrences?: number | null;
  last_seen_at?: string | null;
  error_message?: string | null;
};

type InstagramRecentPublishRow = {
  instagram_published_at?: string | null;
};

export type InstagramLegacyPublishStatus = {
  status: "healthy" | "needs_attention" | "not_configured";
  pendingCount: number;
  blockedByQualityCount: number;
  exhaustedAttemptCount: number;
  failedAttemptCount: number;
  published24h: number;
  hoursSinceLastPublish: number | null;
  tokenConfigured: boolean;
  legacyRenderer: "next-og-image-response-3-card";
};

export type CronFailureDigest = {
  jobName: string;
  occurrences: number;
  lastSeenAt: string | null;
  errorClass: string;
  errorMessage: string | null;
  suppressedReason?: string;
};

export function isSuppressedCronFailure(row: CronFailureRow): string | null {
  const jobName = row.job_name ?? "";
  const errorMessage = row.error_message ?? "";
  if (
    /collect-news/i.test(jobName) &&
    /korea\.kr RSS 수집 이슈/.test(jobName) &&
    /errors=\d+\s*\/\s*total=0|RSS/i.test(errorMessage)
  ) {
    return "korea.kr RSS service discontinued; HTML topic collector is the supported path";
  }
  if (
    /publish-blog/i.test(jobName) &&
    /발행 가능한 정책을 못 찾았어요|모든 정책이 이미 글로 발행됐거나 매칭이 없어요/.test(errorMessage)
  ) {
    return "blog category exhausted; publish-blog cron now skips exhausted categories without alerting";
  }
  if (
    /publish-blog/i.test(jobName) &&
    /\[육아·가족\]/.test(errorMessage) &&
    /본문이 너무 짧음|meta_description 길이 부적정/.test(errorMessage)
  ) {
    return "family blog candidates exhausted quality guard; publish-blog cron now skips all-quality-rejected categories";
  }
  return null;
}

export function classifyCronFailureError(message: string | null | undefined): string {
  const text = (message ?? "").trim();
  if (!text) return "unknown";
  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(text)) return "timeout";
  if (/rate limit|429|too many requests/i.test(text)) return "rate_limit";
  if (/401|403|unauthori[sz]ed|forbidden|permission|invalid secret/i.test(text)) {
    return "auth";
  }
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(text)) {
    return "network";
  }
  if (/schema|column|relation|does not exist|PGRST|SQL|syntax/i.test(text)) {
    return "db_schema";
  }
  if (/env|missing|undefined|null|not configured|설정/i.test(text)) return "config";
  return text.split(/[:\n]/)[0].slice(0, 80) || "other";
}

export function summarizeCronFailures(rows: CronFailureRow[]): {
  recent: CronFailureDigest[];
  suppressedRecent: CronFailureDigest[];
  totalOccurrences: number;
  suppressedOccurrences: number;
  byErrorClass: Record<string, number>;
  byJobName: Record<string, number>;
} {
  const recent: CronFailureDigest[] = [];
  const suppressedRecent: CronFailureDigest[] = [];
  for (const row of rows) {
    const jobName = row.job_name ?? "unknown";
    const occurrences = row.occurrences ?? 1;
    const errorMessage = (row.error_message ?? "").slice(0, 180) || null;
    const digest = {
      jobName,
      occurrences,
      lastSeenAt: row.last_seen_at ?? null,
      errorClass: classifyCronFailureError(errorMessage),
      errorMessage,
    };
    const suppressedReason = isSuppressedCronFailure(row);
    if (suppressedReason) {
      suppressedRecent.push({ ...digest, suppressedReason });
    } else {
      recent.push(digest);
    }
  }
  const byErrorClass: Record<string, number> = {};
  const byJobName: Record<string, number> = {};
  let totalOccurrences = 0;
  for (const item of recent) {
    totalOccurrences += item.occurrences;
    byErrorClass[item.errorClass] = (byErrorClass[item.errorClass] ?? 0) + 1;
    byJobName[item.jobName] = (byJobName[item.jobName] ?? 0) + 1;
  }
  const suppressedOccurrences = suppressedRecent.reduce((sum, item) => sum + item.occurrences, 0);
  return { recent, suppressedRecent, totalOccurrences, suppressedOccurrences, byErrorClass, byJobName };
}

export function summarizeInstagramLegacyPublishStatus(input: {
  pendingCount?: number | null;
  blockedByQualityCount?: number | null;
  exhaustedAttemptCount?: number | null;
  failedAttemptCount?: number | null;
  published24h?: number | null;
  latestPublishedAt?: string | null;
  tokenConfigured?: boolean | null;
  now?: Date;
}): InstagramLegacyPublishStatus {
  const now = input.now ?? new Date();
  const pendingCount = input.pendingCount ?? 0;
  const blockedByQualityCount = input.blockedByQualityCount ?? 0;
  const exhaustedAttemptCount = input.exhaustedAttemptCount ?? 0;
  const failedAttemptCount = input.failedAttemptCount ?? 0;
  const published24h = input.published24h ?? 0;
  const tokenConfigured = input.tokenConfigured === true;
  const latestPublishedAt = input.latestPublishedAt ?? null;
  const hoursSinceLastPublish = latestPublishedAt
    ? Math.round((now.getTime() - new Date(latestPublishedAt).getTime()) / 3_600_000)
    : null;

  let status: InstagramLegacyPublishStatus["status"] = "healthy";
  if (!tokenConfigured) {
    status = "not_configured";
  } else if (
    exhaustedAttemptCount > 0 ||
    failedAttemptCount > 0 ||
    blockedByQualityCount > 0 ||
    (pendingCount > 0 && (hoursSinceLastPublish === null || hoursSinceLastPublish > 26))
  ) {
    status = "needs_attention";
  }

  return {
    status,
    pendingCount,
    blockedByQualityCount,
    exhaustedAttemptCount,
    failedAttemptCount,
    published24h,
    hoursSinceLastPublish,
    tokenConfigured,
    legacyRenderer: "next-og-image-response-3-card",
  };
}

export async function runDiagnose(
  question: DiagnoseQuestion,
): Promise<DiagnoseResult> {
  const handler = QUESTION_HANDLERS[question];
  if (!handler) {
    throw new Error(`unknown diagnose question: ${question}`);
  }
  const data = await handler();
  return {
    question,
    data,
    collected_at: new Date().toISOString(),
  };
}

export function listDiagnoseQuestions(): DiagnoseQuestion[] {
  return Object.keys(QUESTION_HANDLERS) as DiagnoseQuestion[];
}

// ─── handlers ────────────────────────────────────────────────

const QUESTION_HANDLERS: Record<DiagnoseQuestion, () => Promise<unknown>> = {
  health_overview: async () => {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [cron_failures, cronFailureRows, alerts] = await Promise.all([
      admin
        .from("cron_failure_log")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", since24h),
      admin
        .from("cron_failure_log")
        .select("job_name, occurrences, last_seen_at, error_message")
        .gte("last_seen_at", since24h)
        .order("last_seen_at", { ascending: false })
        .limit(100),
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "health_alert_run")
        .gte("created_at", since24h),
    ]);
    const failureSummary = summarizeCronFailures((cronFailureRows.data ?? []) as CronFailureRow[]);
    return {
      cron_failures_24h: failureSummary.recent.length,
      cron_failure_raw_24h: cronFailureRows.data?.length ?? cron_failures.count ?? 0,
      cron_failure_suppressed_24h: failureSummary.suppressedRecent.length,
      cron_failure_occurrences_24h: failureSummary.totalOccurrences,
      cron_failure_suppressed_occurrences_24h: failureSummary.suppressedOccurrences,
      cron_failure_recent: failureSummary.recent,
      cron_failure_suppressed_recent: failureSummary.suppressedRecent,
      cron_failure_by_error_class: failureSummary.byErrorClass,
      cron_failure_by_job_name: failureSummary.byJobName,
      health_alert_runs_24h: alerts.count ?? 0,
    };
  },

  cron_recent_24h: async () => {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await admin
      .from("admin_actions")
      .select("action, created_at")
      .like("action", "%_run")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(200);
    const byAction = new Map<string, number>();
    for (const row of (data ?? []) as { action: string }[]) {
      byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1);
    }
    const { data: failureRows, count: failureCount } = await admin
      .from("cron_failure_log")
      .select("job_name, occurrences, last_seen_at, error_message", {
        count: "exact",
      })
      .gte("last_seen_at", since24h)
      .order("last_seen_at", { ascending: false })
      .limit(100);
    const failureSummary = summarizeCronFailures((failureRows ?? []) as CronFailureRow[]);
    return {
      run_counts_by_action: Object.fromEntries(byAction),
      failure_count_24h: failureSummary.recent.length,
      failure_raw_count_24h: failureRows?.length ?? failureCount ?? 0,
      failure_suppressed_count_24h: failureSummary.suppressedRecent.length,
      failure_occurrences_24h: failureSummary.totalOccurrences,
      failure_suppressed_occurrences_24h: failureSummary.suppressedOccurrences,
      failure_recent: failureSummary.recent,
      failure_suppressed_recent: failureSummary.suppressedRecent,
      failure_by_error_class: failureSummary.byErrorClass,
      failure_by_job_name: failureSummary.byJobName,
    };
  },

  news_freshness: async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("news_posts")
      .select("published_at")
      .order("published_at", { ascending: false })
      .limit(1);
    const latest = (data ?? [])[0]?.published_at ?? null;
    const since5d = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const { count } = await admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since5d);
    return {
      latest_published_at: latest,
      count_last_5d: count ?? 0,
    };
  },

  press_tier_status: async () => {
    const admin = createAdminClient();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const staleLowCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [
      midPending,
      lowPending,
      staleLowPending,
      autoRevoke7d,
      cleanupRuns7d,
    ] = await Promise.all([
      admin
        .from("press_ingest_candidates")
        .select("id, news_posts!inner(id)", { count: "exact", head: true })
        .eq("confidence_tier", "mid")
        .eq("status", "pending")
        .in("program_type", ["welfare", "loan"]),
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "low")
        .eq("status", "pending"),
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "low")
        .eq("status", "pending")
        .lt("created_at", staleLowCutoff),
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_auto_revoke")
        .gte("created_at", since7d),
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_reject")
        .eq("details->>reason", "low_tier_14d_auto_cleanup")
        .gte("created_at", since7d),
    ]);
    return {
      mid_pending: midPending.count ?? 0,
      low_pending: lowPending.count ?? 0,
      stale_low_pending_14d: staleLowPending.count ?? 0,
      auto_revoke_7d: autoRevoke7d.count ?? 0,
      low_cleanup_runs_7d: cleanupRuns7d.count ?? 0,
    };
  },

  llm_spending_28d: async () => {
    // gemini-spending.ts 재사용 (G4 spec)
    const { getGeminiSpendingStats, GEMINI_KEEPIOO_CAP_KRW } = await import(
      "@/lib/analytics/gemini-spending"
    );
    const stats = await getGeminiSpendingStats(28);
    return {
      ...stats,
      cap_krw: GEMINI_KEEPIOO_CAP_KRW,
      ratio: Math.min(1, stats.monthlyProjectionKrw / GEMINI_KEEPIOO_CAP_KRW),
    };
  },

  blog_publish_status: async () => {
    const { getBlogPublishStats } = await import(
      "@/lib/analytics/blog-publish-stats"
    );
    return getBlogPublishStats();
  },

  instagram_legacy_publish_status: async () => {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [
      pending,
      blockedByQuality,
      exhaustedAttempts,
      failedAttempts,
      published24h,
      latestPublished,
      tokenRows,
    ] = await Promise.all([
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .eq("admin_review_required", false)
        .lt("instagram_attempt_count", 3),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .or("admin_review_required.is.null,admin_review_required.eq.true"),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .gte("instagram_attempt_count", 3),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("instagram_error", "is", null)
        .lt("instagram_attempt_count", 3),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .gte("instagram_published_at", since24h),
      admin
        .from("blog_posts")
        .select("instagram_published_at")
        .not("instagram_published_at", "is", null)
        .order("instagram_published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("instagram_oauth_tokens")
        .select("id", { count: "exact", head: true }),
    ]);
    const latest = latestPublished.data as InstagramRecentPublishRow | null;
    return summarizeInstagramLegacyPublishStatus({
      pendingCount: pending.count,
      blockedByQualityCount: blockedByQuality.count,
      exhaustedAttemptCount: exhaustedAttempts.count,
      failedAttemptCount: failedAttempts.count,
      published24h: published24h.count,
      latestPublishedAt: latest?.instagram_published_at ?? null,
      tokenConfigured: (tokenRows.count ?? 0) > 0,
    });
  },

  sms_delivery_24h: async () => {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await admin
      .from("admin_actions")
      .select("action, details")
      .in("action", ["daily_digest_run", "external_console_check_run", "support_reminder_run"])
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((row) => {
      const d = (row.details ?? {}) as {
        sms_ok?: unknown;
        sms_reason?: unknown;
        telegram_ok?: unknown;
      };
      return {
        action: row.action,
        sms_ok: d.sms_ok ?? null,
        sms_reason: d.sms_reason ?? null,
        telegram_ok: d.telegram_ok ?? null,
      };
    });
  },

  agent_recent_actions: async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_actions")
      .select("action, created_at, details")
      .in("action", ["agent_diagnose_run", "agent_execute_run"])
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  },

  alert_recent_24h: async () => {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await admin
      .from("admin_actions")
      .select("created_at, details")
      .eq("action", "health_alert_run")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((row) => ({
      created_at: row.created_at,
      alert_keys: (row.details as { alert_keys?: unknown })?.alert_keys ?? [],
    }));
  },

  db_table_sizes: async () => {
    // 5/19 추가 — Supabase storage growth 추적. 큰 테이블 row count 만 보고.
    // 실제 byte size 는 Supabase dashboard 에서만. row count = 증가 추세 proxy.
    const admin = createAdminClient();
    const tables = [
      "admin_actions",
      "news_posts",
      "press_ingest_candidates",
      "cron_failure_log",
      "blog_posts",
    ];
    const counts = await Promise.all(
      tables.map(async (table) => {
        try {
          const { count } = await admin
            .from(table)
            .select("id", { count: "exact", head: true });
          return { table, count: count ?? 0, error: null };
        } catch (e) {
          return {
            table,
            count: 0,
            error: e instanceof Error ? e.message.slice(0, 100) : String(e),
          };
        }
      }),
    );
    return {
      counts,
      collected_note:
        "row count 기반. byte size 는 Supabase dashboard 에서만. 급증 추세 = storage 한도 위험 신호.",
    };
  },

  rate_limit_status: async () => {
    const { getRateLimitStatus } = await import("@/lib/monitoring/rate-limit-status");
    return getRateLimitStatus({ lookbackMinutes: 10, limit: 10 });
  },

  local_press_collector_health: async () => {
    // 자가치유 감지 확장 — 23 GHA collector audit 를 읽어 고장 collector + 추정
    // 원인 + 수리 제안 반환. **읽기 전용(W0)** — 실제 수정 X, 사람이 보고 수동 적용.
    const { getCollectorDiagnoses, formatCollectorProblems, isProblemStatus } =
      await import("@/lib/monitoring/collector-health-diagnosis");
    const diagnoses = await getCollectorDiagnoses(24);
    const problems = diagnoses.filter((x) => isProblemStatus(x.status));
    return {
      total_collectors: diagnoses.length,
      problem_count: problems.length,
      healthy_count: diagnoses.length - problems.length,
      problems, // 문제 collector 만 (정상 제외 — Codex context 부담 ↓)
      telegram_summary: formatCollectorProblems(diagnoses),
    };
  },
};
