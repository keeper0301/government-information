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
  | "sms_delivery_24h"          // daily-digest / external-console-check 발송 결과
  | "agent_recent_actions"      // agent_execute_run 최근 50건 (Codex 본인 행동 점검)
  | "alert_recent_24h"          // health-alert 발화 추세
  | "db_table_sizes";           // 5/19 추가 — 큰 테이블 row count (storage growth 추적)

export type DiagnoseResult = {
  question: DiagnoseQuestion;
  data: unknown;
  collected_at: string;
};

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
    const [cron_failures, alerts] = await Promise.all([
      admin
        .from("cron_failure_log")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", since24h),
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "health_alert_run")
        .gte("created_at", since24h),
    ]);
    return {
      cron_failures_24h: cron_failures.count ?? 0,
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
    return Object.fromEntries(byAction);
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
    const [midPending, lowPending, autoRevoke7d] = await Promise.all([
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "mid")
        .eq("status", "pending"),
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "low")
        .eq("status", "pending"),
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_auto_revoke")
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    ]);
    return {
      mid_pending: midPending.count ?? 0,
      low_pending: lowPending.count ?? 0,
      auto_revoke_7d: autoRevoke7d.count ?? 0,
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
};
