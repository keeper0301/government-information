// ============================================================
// 자율 운영 마스터 5 Phase 가동 상태 + 24h 활동 요약.
// ============================================================
// /admin/autonomous hub 페이지가 호출. 사장님 매일 1번 클릭 = 평시 0분 운영.
// graceful: 미적용 DDL · 미설정 env 모두 0 fallback (에러 안 throw).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getInsightProgress } from "./insight-progress";

export type PhaseMetric = { label: string; value: string };
// pendingAction — url 옵셔널. 있으면 hub 에서 link 로 표시되어 클릭 1회로 portal 진입.
export type PendingAction = { text: string; url?: string };
export type PhaseStatus = {
  phase: 1 | 2 | 3 | 4 | 5;
  title: string;
  /** 외부 액션·DDL 모두 완료되어 실제 가동 중 */
  active: boolean;
  /** 24h 활동 요약 — 카드 1줄씩 표시 */
  metrics: PhaseMetric[];
  /** 사장님이 처리해야 할 외부 액션 (없으면 빈 배열) */
  pendingActions: PendingAction[];
};

const MS_PER_DAY = 24 * 3600_000;
const since24h = () => new Date(Date.now() - MS_PER_DAY).toISOString();

// estimated count — 큰 테이블에서 exact 는 느림. hub 표시용 어림수면 충분.
// graceful: 미실재 action 또는 RPC 에러 시 0 반환.
async function countAction24h(action: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("admin_actions")
      .select("*", { count: "estimated", head: true })
      .eq("action", action)
      .gte("created_at", since24h());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// 테이블 row 카운트 (graceful — 미적용 DDL 시 0)
async function countTable(table: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "estimated", head: true })
      .gte("created_at", since24h());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// 테이블 존재 여부 (미적용 DDL 시 false). limit(0) 으로 row 안 fetch, error 만 확인.
async function tableExists(table: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from(table).select("id").limit(0);
    return !error;
  } catch {
    return false;
  }
}

async function phase1(): Promise<PhaseStatus> {
  // 2026-05-14 — 9 cron audit 가시성 확장 (subagent Improvement-1).
  // health_alert_run 외 신규 5 cron audit 도 hub 카드에 노출. 사장님 1번 클릭으로
  // 운영 cron 가동 자체 확인 가능 (admin_actions query 직접 안 해도 됨).
  const [
    healthRuns,
    dailyDigest,
    weeklyOpsDigest,
    sentryDaily,
    onboardingReminder,
    policyEnrich,
    improvementScan,
  ] = await Promise.all([
    countAction24h("health_alert_run"),
    countAction24h("daily_digest_run"),
    countAction24h("weekly_ops_digest_run"),
    countAction24h("sentry_daily_summary_run"),
    countAction24h("onboarding_reminder_run"),
    countAction24h("policy_enrich_run"),
    countAction24h("autonomous_improvement_scan_run"),
  ]);
  return {
    phase: 1,
    title: "사고 자동 진단",
    active: true, // env default 로 항상 가동
    metrics: [
      { label: "24h health-alert", value: `${healthRuns}회 (정상 1)` },
      {
        label: "24h daily-digest",
        value: `${dailyDigest}회 (정상 1, KST 08:00)`,
      },
      {
        label: "24h sentry-summary",
        value: `${sentryDaily}회 (정상 1, KST 09:45)`,
      },
      {
        label: "24h onboarding-reminder",
        value: `${onboardingReminder}회 (정상 1, KST 11:05)`,
      },
      {
        label: "24h policy-enrich",
        value: `${policyEnrich}회 (정상 1, KST 03:30)`,
      },
      {
        label: "24h 개선 스캔",
        value: `${improvementScan}회 (정상 1, KST 10:20)`,
      },
      {
        label: "24h weekly-ops-digest",
        value: `${weeklyOpsDigest}회 (주 1, 화 KST 09:00)`,
      },
      { label: "임계치", value: "16종 (#16 = naver_publish_failure)" },
    ],
    pendingActions: [],
  };
}

async function phase2(): Promise<PhaseStatus> {
  const [inserts, ddlApplied] = await Promise.all([
    countTable("decision_pending"),
    tableExists("decision_pending"),
  ]);
  const solapiActive = !!process.env.SOLAPI_WEBHOOK_SECRET;
  const pending: PendingAction[] = [];
  if (!ddlApplied)
    pending.push({ text: "운영DB에 075번 마이그레이션 적용 (사장님 승인 필요)" });
  if (!solapiActive) {
    pending.push({
      text: "Solapi 양방향 SMS 가입 + webhook URL 등록",
      url: "https://console.solapi.com/develop/webhook",
    });
    pending.push({
      text: "Vercel 환경변수 SOLAPI_WEBHOOK_SECRET / SMS_DECISION_ALLOWED_FROM 등록 후 재배포",
      url: "https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables",
    });
  }
  return {
    phase: 2,
    title: "SMS 결정 위임",
    active: ddlApplied && solapiActive,
    metrics: [
      { label: "24h decision 큐", value: `${inserts}건` },
      { label: "DB 테이블", value: ddlApplied ? "✓ 적용됨" : "✗ 미적용" },
      { label: "Solapi webhook env", value: solapiActive ? "✓ 설정" : "✗ 미설정" },
    ],
    pendingActions: pending,
  };
}

async function phase3(): Promise<PhaseStatus> {
  const [checks, insight] = await Promise.all([
    countAction24h("external_console_check"),
    getInsightProgress(),
  ]);
  const env = (...keys: string[]) => keys.every((k) => !!process.env[k]);
  // 콘솔별 [라벨, 활성, 미설정 시 안내] — 추가 console 은 이 표만 갱신.
  const cons: [string, boolean, string | null][] = [
    ["사이트", true, null],
    ["카카오", env("SOLAPI_API_KEY"), "Solapi 환경변수 SOLAPI_API_KEY 등록 (카카오 통계 점검)"],
    ["토스", env("TOSS_SECRET_KEY"), null],
    [
      "AdSense",
      env("ADSENSE_CLIENT_ID", "ADSENSE_CLIENT_SECRET", "ADSENSE_REFRESH_TOKEN"),
      "AdSense OAuth 발급 → Vercel env 3종 (ADSENSE_CLIENT_ID/SECRET/REFRESH_TOKEN). 가이드: docs/external-actions/adsense-oauth-guide.md",
    ],
    [
      "GA4",
      env("GA4_PROPERTY_ID", "GA4_CLIENT_ID", "GA4_CLIENT_SECRET", "GA4_REFRESH_TOKEN"),
      "GA4 OAuth 발급 → Vercel env 4종 (GA4_PROPERTY_ID/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN). 가이드: docs/external-actions/ga4-oauth-guide.md",
    ],
    ["Vercel", env("VERCEL_TOKEN"), null], // 봇 등록 후 자동 가동 (텔레그램 RBAC commit 9f1659f)
    [
      "Supabase",
      env("SUPABASE_PERSONAL_ACCESS_TOKEN"),
      "Supabase Personal Access Token 발급 → Vercel env SUPABASE_PERSONAL_ACCESS_TOKEN 등록 (Management API 점검)",
    ],
    [
      "Search Console",
      env("SC_SITE_URL", "SC_CLIENT_ID", "SC_CLIENT_SECRET", "SC_REFRESH_TOKEN"),
      "Search Console OAuth 발급 → Vercel env 4종 (SC_SITE_URL/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN). 가이드: docs/external-actions/search-console-oauth-guide.md",
    ],
  ];
  const integrations = cons.filter(([, ok]) => ok).map(([l]) => l);
  // 외부 콘솔별 OAuth/API key 발급 portal URL — 사장님 hub 클릭 1회로 진입.
  const consoleUrls: Record<string, string> = {
    카카오: "https://console.solapi.com/develop/api-keys",
    AdSense: "https://console.cloud.google.com/auth/clients",
    GA4: "https://console.cloud.google.com/auth/clients",
    Supabase: "https://supabase.com/dashboard/account/tokens",
    "Search Console": "https://console.cloud.google.com/auth/clients",
  };
  const pending: PendingAction[] = cons
    .filter(([, ok, hint]) => !ok && hint)
    .map(([label, , hint]) => ({
      text: hint as string,
      url: consoleUrls[label],
    }));
  return {
    phase: 3,
    title: "외부 콘솔 자동 점검",
    active: true,
    metrics: [
      { label: "24h check 실행", value: `${checks}회` },
      { label: "통합 console", value: integrations.join("+") },
      {
        label: "정책 해설 진행률",
        value: `${insight.welfare.filled + insight.loan.filled}/${insight.welfare.total + insight.loan.total} (${insight.pct}%)`,
      },
    ],
    pendingActions: pending,
  };
}

async function phase4(): Promise<PhaseStatus> {
  const [tickets, ddlApplied] = await Promise.all([
    countTable("support_tickets"),
    tableExists("support_tickets"),
  ]);
  // DDL 적용 = active. 큐 활용 (tickets > 0) 은 자연 누적.
  return {
    phase: 4,
    title: "AI 챗봇 CS",
    active: ddlApplied,
    metrics: [
      { label: "24h 신규 문의", value: `${tickets}건` },
      { label: "DB 테이블", value: ddlApplied ? "✓ 적용됨" : "✗ 미적용" },
      { label: "intent 분류", value: "9종 + 자동 응답 4매핑" },
    ],
    pendingActions: ddlApplied
      ? []
      : [{ text: "운영DB에 076번 마이그레이션 적용 (사장님 승인 필요)" }],
  };
}

// naver Extension 24h success count (사장님 본체 PC Chrome Extension)
// `naver_publish_audit` 테이블에 result='success' 인 24h row.
// pendingActions 분기에 쓰이므로 exact count (codex P2 fix). 24h × 5/day = max 5 row 라 부담 0.
async function naverExtSuccess24h(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("naver_publish_audit")
      .select("id", { count: "exact", head: true })
      .eq("result", "success")
      .gte("attempted_at", since24h());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function phase5(): Promise<PhaseStatus> {
  const blogs = await countAction24h("blog_publish_run");
  const longTail = await countAction24h("long_tail_seo_run");
  const snsRuns = await countAction24h("sns_publish_run");
  const naverRuns = await naverExtSuccess24h();
  const naverEnvSet = !!process.env.NAVER_EXTENSION_SECRET;

  const pendingActions: PendingAction[] = [];
  if (snsRuns === 0) {
    // SNS 4종 — 각각 다른 portal. Twitter 만 link, 나머지는 가이드 위주.
    pendingActions.push({
      text: "Twitter 개발자 앱 등록 + OAuth 발급",
      url: "https://developer.x.com/en/portal/dashboard",
    });
    pendingActions.push({
      text: "Meta (Facebook / Instagram / Threads) 개발자 앱 등록 + OAuth 발급",
      url: "https://developers.facebook.com/apps/",
    });
    pendingActions.push({
      text: "티스토리 OAuth 발급 (외부 자동 글쓰기 확장)",
      url: "https://www.tistory.com/guide/api/manage/register",
    });
  }
  // naver Extension 셋업 상태 자동 감지 (codex P1 fix — env 없는 케이스도 안내).
  if (!naverEnvSet) {
    pendingActions.push({
      text: "Vercel env NAVER_EXTENSION_SECRET 등록 → setup-desktop.ps1 실행 (chrome-extension/README.md 빠른 설치)",
      url: "https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables",
    });
  } else if (naverRuns === 0) {
    pendingActions.push({
      text: "본체 PC 의 PowerShell 에서 setup-desktop.ps1 실행 → Chrome Extension 설치 → 🧪 Dry-run (chrome-extension/README.md 참고)",
    });
  }

  return {
    phase: 5,
    title: "마케팅 자동화",
    active: true,
    metrics: [
      { label: "24h 자동 블로그", value: `${blogs}건` },
      { label: "24h SEO long-tail", value: `${longTail}건` },
      { label: "24h SNS 게시", value: `${snsRuns}건` },
      {
        label: "24h naver 블로그",
        value: `${naverRuns}건${naverEnvSet ? "" : " (env 미설정)"}`,
      },
    ],
    pendingActions,
  };
}

export async function getAllPhaseStatuses(): Promise<PhaseStatus[]> {
  return Promise.all([phase1(), phase2(), phase3(), phase4(), phase5()]);
}
