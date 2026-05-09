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
  const [inserts, ddlApplied] = await Promise.all([
    countTable("decision_pending"),
    tableExists("decision_pending"),
  ]);
  const solapiActive = !!process.env.SOLAPI_WEBHOOK_SECRET;
  const pending: string[] = [];
  if (!ddlApplied) pending.push("운영DB에 075번 마이그레이션 적용 (사장님 승인 필요)");
  if (!solapiActive) {
    pending.push("Solapi 양방향 SMS 가입 + webhook URL 등록");
    pending.push("Vercel 환경변수 SOLAPI_WEBHOOK_SECRET / SMS_DECISION_ALLOWED_FROM 등록 후 재배포");
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
  const checks = await countAction24h("external_console_check");
  const kakaoEnv = !!process.env.SOLAPI_API_KEY;
  const tossEnv = !!process.env.TOSS_SECRET_KEY;
  const adsenseEnv = !!(
    process.env.ADSENSE_CLIENT_ID &&
    process.env.ADSENSE_CLIENT_SECRET &&
    process.env.ADSENSE_REFRESH_TOKEN
  );
  const ga4Env = !!(
    process.env.GA4_PROPERTY_ID &&
    process.env.GA4_CLIENT_ID &&
    process.env.GA4_CLIENT_SECRET &&
    process.env.GA4_REFRESH_TOKEN
  );
  const integrations = [
    "사이트",
    kakaoEnv ? "카카오" : null,
    tossEnv ? "토스" : null,
    adsenseEnv ? "AdSense" : null,
    ga4Env ? "GA4" : null,
  ].filter(Boolean);
  const pending: string[] = [];
  if (!kakaoEnv) pending.push("Solapi 환경변수 SOLAPI_API_KEY 등록 (카카오 통계 점검)");
  if (!adsenseEnv) {
    pending.push(
      "AdSense OAuth 발급 → Vercel env 3종 (ADSENSE_CLIENT_ID/SECRET/REFRESH_TOKEN). 가이드: docs/external-actions/adsense-oauth-guide.md",
    );
  }
  if (!ga4Env) {
    pending.push(
      "GA4 OAuth 발급 → Vercel env 4종 (GA4_PROPERTY_ID/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN). 가이드: docs/external-actions/ga4-oauth-guide.md",
    );
  }
  return {
    phase: 3,
    title: "외부 콘솔 자동 점검",
    active: true, // 사이트 가용성은 env 무관
    metrics: [
      { label: "24h check 실행", value: `${checks}회` },
      { label: "통합 console", value: integrations.join("+") },
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
      : ["운영DB에 076번 마이그레이션 적용 (사장님 승인 필요)"],
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
            "Twitter / Facebook / Instagram / Threads 외부 앱 OAuth × 4 발급",
            "티스토리 OAuth 발급 (외부 자동 글쓰기 확장)",
          ]
        : [],
  };
}

export async function getAllPhaseStatuses(): Promise<PhaseStatus[]> {
  return Promise.all([phase1(), phase2(), phase3(), phase4(), phase5()]);
}
