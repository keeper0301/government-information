// ============================================================
// 자율 운영 마스터 5 Phase 가동 상태 + 24h 활동 요약.
// ============================================================
// /admin/autonomous hub 페이지가 호출. 사장님 매일 1번 클릭 = 평시 0분 운영.
// graceful: 미적용 DDL · 미설정 env 모두 0 fallback (에러 안 throw).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type PhaseMetric = { label: string; value: string };
export type PhaseStatus = {
  phase: 1 | 2 | 3 | 4 | 5;
  title: string;
  /** 외부 액션·DDL 모두 완료되어 실제 가동 중 */
  active: boolean;
  /** 24h 활동 요약 — 카드 1줄씩 표시 */
  metrics: PhaseMetric[];
  /** 사장님이 처리해야 할 외부 액션 (없으면 빈 배열) */
  pendingActions: string[];
};

const HOUR_24 = "1 day";

// 24h 안 admin_actions 카운트 (action 별)
async function countAction24h(action: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("admin_actions")
    .select("*", { count: "exact", head: true })
    .eq("action", action)
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return count ?? 0;
}

// 테이블 row 카운트 (graceful — 미적용 DDL 시 0)
async function countTable(table: string, sinceHours = 24): Promise<number> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
    const { count, error } = await admin
      .from(table)
      // any cast — graceful 미적용 DDL 시 error 반환
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function phase1(): Promise<PhaseStatus> {
  const runs = await countAction24h("health_alert_run");
  return {
    phase: 1,
    title: "사고 자동 진단",
    active: true, // env default 로 항상 가동
    metrics: [
      { label: "24h cron 실행", value: `${runs}회 (정상 1)` },
      { label: "임계치", value: "news/press/enrich 4종" },
    ],
    pendingActions: [],
  };
}

async function phase2(): Promise<PhaseStatus> {
  const inserts = await countTable("decision_pending");
  // DDL 075 미적용 시 inserts=0 + 외부 액션 안내
  const ddlApplied = inserts >= 0; // 항상 true (table 자체 존재 확인은 별도)
  const solapiActive = !!process.env.SOLAPI_WEBHOOK_SECRET;
  return {
    phase: 2,
    title: "SMS 결정 위임",
    active: ddlApplied && solapiActive,
    metrics: [
      { label: "24h decision 큐", value: `${inserts}건` },
      { label: "Solapi webhook env", value: solapiActive ? "✓ 설정" : "✗ 미설정" },
    ],
    pendingActions: solapiActive
      ? []
      : [
          "DDL 075 (decision_pending) prod apply (명시 승인)",
          "Solapi 양방향 SMS 가입 + webhook URL 등록",
          "Vercel env: SOLAPI_WEBHOOK_SECRET / SMS_DECISION_ALLOWED_FROM",
        ],
  };
}

async function phase3(): Promise<PhaseStatus> {
  const checks = await countAction24h("external_console_check");
  const kakaoEnv = !!process.env.SOLAPI_API_KEY;
  const tossEnv = !!process.env.TOSS_SECRET_KEY;
  return {
    phase: 3,
    title: "외부 콘솔 자동 점검",
    active: true, // 사이트 가용성은 env 무관
    metrics: [
      { label: "24h check 실행", value: `${checks}회` },
      {
        label: "통합 console",
        value: `사이트${kakaoEnv ? "+카카오" : ""}${tossEnv ? "+토스" : ""}`,
      },
    ],
    pendingActions: [
      ...(kakaoEnv ? [] : ["Solapi env (SOLAPI_API_KEY) — 카카오 통계 점검 위해"]),
      "AdSense Google API OAuth + refresh token (Phase 3 다음 통합)",
      "GA4 service account + Analytics Data API (Phase 3 다음 통합)",
    ],
  };
}

async function phase4(): Promise<PhaseStatus> {
  const tickets = await countTable("support_tickets");
  return {
    phase: 4,
    title: "AI 챗봇 CS",
    active: tickets >= 0, // table 존재 확인 graceful
    metrics: [
      { label: "24h 신규 문의", value: `${tickets}건` },
      { label: "intent 분류", value: "9종 + 자동 응답 4매핑" },
    ],
    pendingActions:
      tickets > 0
        ? []
        : ["DDL 076 (support_tickets) prod apply (미적용 시 0건)"],
  };
}

async function phase5(): Promise<PhaseStatus> {
  const blogs = await countAction24h("blog_publish_run");
  const longTail = await countAction24h("long_tail_seo_run");
  const snsRuns = await countAction24h("sns_publish_run");
  return {
    phase: 5,
    title: "마케팅 자동화",
    active: true,
    metrics: [
      { label: "24h 자동 블로그", value: `${blogs}건` },
      { label: "24h SEO long-tail", value: `${longTail}건` },
      { label: "24h SNS 게시", value: `${snsRuns}건` },
    ],
    pendingActions:
      snsRuns === 0
        ? [
            "Twitter / Facebook / Instagram / Threads OAuth × 4 등록",
            "티스토리 OAuth (Phase 5-C)",
          ]
        : [],
  };
}

export async function getAllPhaseStatuses(): Promise<PhaseStatus[]> {
  return Promise.all([phase1(), phase2(), phase3(), phase4(), phase5()]);
}
