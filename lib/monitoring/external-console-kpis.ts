// ============================================================
// 5 외부 console KPI 통합 추출 — autonomous hub 가시화
// ============================================================
// ga4 / vercel / supabase / kakao / toss 5 console 의 audit kpis 를
// 1번 supabase query 로 추출. AdSense·SC 는 자체 module 분리 운영 중.
//
// 어제 schema 사고 (ccb4ac0) 재발 방지: 실제 prod schema 검증 후 작성.
// extractKpisByConsole helper (adsense-revenue-trend.ts) 재사용.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractKpisByConsole,
  type AuditRow,
} from "@/lib/monitoring/adsense-revenue-trend";

export type Ga4Metrics = {
  sessions: number;
  activeUsers: number;
  bounceRate: number;
};

export type VercelMetrics = {
  total24h: number;
  failed24h: number;
  failureRate: number;
  latestState: string | null;
  latestUid: string | null;
};

export type SupabaseMetrics = {
  projectStatus: string | null;
  projectRegion: string | null;
  projectName: string | null;
  advisorWarn: number;
  advisorError: number;
};

export type KakaoMetrics = {
  balanceTotal: number;
  balanceCash: number;
  balancePoint: number;
  total24h: number;
  success24h: number;
  failed24h: number;
  pending24h: number;
  failureRate: number;
};

export type TossMetrics = {
  activeTotal: number;
  newActive24h: number;
  cancelled24h: number;
  churnRate24h: number;
};

export type ExternalConsoleMetrics = {
  ga4: Ga4Metrics | null;
  vercel: VercelMetrics | null;
  supabase: SupabaseMetrics | null;
  kakao: KakaoMetrics | null;
  toss: TossMetrics | null;
  /** 측정 시각 (UTC ISO). null = 데이터 없음 */
  observedAt: string | null;
};

// ============================================================
// pure functions — row 1건 → metrics. 단위 테스트 + collect 둘 다 호출.
// ============================================================

// num: undefined/null/NaN → 0 fallback
function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

// str: 문자열 아니면 null
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function extractGa4Metrics(row: AuditRow): Ga4Metrics | null {
  const k = extractKpisByConsole(row, "ga4");
  if (!k || !("sessions" in k)) return null;
  return {
    sessions: num(k.sessions),
    activeUsers: num(k.active_users),
    bounceRate: num(k.bounce_rate),
  };
}

export function extractVercelMetrics(row: AuditRow): VercelMetrics | null {
  const k = extractKpisByConsole(row, "vercel");
  if (!k || !("total_24h" in k)) return null;
  return {
    total24h: num(k.total_24h),
    failed24h: num(k.failed_24h),
    failureRate: num(k.failure_rate),
    latestState: str(k.latest_state),
    latestUid: str(k.latest_uid),
  };
}

export function extractSupabaseMetrics(row: AuditRow): SupabaseMetrics | null {
  const k = extractKpisByConsole(row, "supabase");
  if (!k || !("project_status" in k)) return null;
  return {
    projectStatus: str(k.project_status),
    projectRegion: str(k.project_region),
    projectName: str(k.project_name),
    advisorWarn: num(k.advisor_warn),
    advisorError: num(k.advisor_error),
  };
}

export function extractKakaoMetrics(row: AuditRow): KakaoMetrics | null {
  const k = extractKpisByConsole(row, "kakao");
  if (!k || !("balance_total" in k)) return null;
  return {
    balanceTotal: num(k.balance_total),
    balanceCash: num(k.balance_cash),
    balancePoint: num(k.balance_point),
    total24h: num(k.total_24h),
    success24h: num(k.success_24h),
    failed24h: num(k.failed_24h),
    pending24h: num(k.pending_24h),
    failureRate: num(k.failure_rate),
  };
}

export function extractTossMetrics(row: AuditRow): TossMetrics | null {
  const k = extractKpisByConsole(row, "toss");
  if (!k || !("active_total" in k)) return null;
  return {
    activeTotal: num(k.active_total),
    newActive24h: num(k.new_active_24h),
    cancelled24h: num(k.cancelled_24h),
    churnRate24h: num(k.churn_rate_24h),
  };
}

// ============================================================
// collect — 1번 supabase query 로 5 console metrics 추출.
// 7일 신선도 가드 + try/catch + console.error.
// ============================================================

export async function collectExternalConsoleMetrics(): Promise<ExternalConsoleMetrics> {
  const empty: ExternalConsoleMetrics = {
    ga4: null,
    vercel: null,
    supabase: null,
    kakao: null,
    toss: null,
    observedAt: null,
  };

  let data: AuditRow[] | null = null;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const res = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "external_console_check_run")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    data = (res.data ?? []) as AuditRow[];
  } catch (e) {
    console.error("[external-console-kpis] collect failed", e);
    return empty;
  }

  for (const row of data ?? []) {
    // 5 console 중 1개라도 valid 면 그 row 의 모든 console metric 반환 (가장 최근 valid row).
    const ga4 = extractGa4Metrics(row);
    const vercel = extractVercelMetrics(row);
    const supabase = extractSupabaseMetrics(row);
    const kakao = extractKakaoMetrics(row);
    const toss = extractTossMetrics(row);
    if (ga4 || vercel || supabase || kakao || toss) {
      return {
        ga4,
        vercel,
        supabase,
        kakao,
        toss,
        observedAt: row.created_at ?? null,
      };
    }
  }
  return empty;
}
