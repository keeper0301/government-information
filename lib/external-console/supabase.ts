// ============================================================
// Supabase 운영 환경 점검 (Phase 3 외부 console)
// ============================================================
// Supabase Management API v1 호출 — 프로젝트 상태 + advisor security 경고.
// 인증: Bearer PAT (SUPABASE_PERSONAL_ACCESS_TOKEN, prod env 등록됨).
// project_ref 는 NEXT_PUBLIC_SUPABASE_URL 의 subdomain 에서 자동 추출.
//
// 점검:
//   - supabase_project_unhealthy — project status != ACTIVE_HEALTHY
//                                  (PAUSED · INIT_FAILED · UPGRADING 등)
//   - supabase_advisor_warn      — security WARN 누적 ≥ 5건 (사장님 검수 임계)
//   - supabase_fetch_failed      — Management API 호출 자체 실패
//
// SUPABASE_PERSONAL_ACCESS_TOKEN 미설정 시 graceful skip.
// project_ref 추출 실패 시 graceful skip (URL 파싱 에러 대응).
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const SUPABASE_API = "https://api.supabase.com";
const FETCH_TIMEOUT_MS = 8_000;
// 사장님 검수 임계 — 1~4건은 자연 누적 (RLS·인덱스 권고), 5건+ 은 누락 신호
const ADVISOR_WARN_THRESHOLD = 5;

// project status — Management API 공식 enum.
// ACTIVE_HEALTHY 만 정상, 그 외는 사장님 즉시 인지 필요.
type ProjectStatus =
  | "ACTIVE_HEALTHY"
  | "ACTIVE_UNHEALTHY"
  | "COMING_UP"
  | "GOING_DOWN"
  | "INACTIVE"
  | "INIT_FAILED"
  | "REMOVED"
  | "RESTORING"
  | "UNKNOWN"
  | "UPGRADING"
  | "PAUSING"
  | "RESTORE_FAILED"
  | string;

export interface SupabaseProject {
  id?: string;
  name?: string;
  status?: ProjectStatus;
  region?: string;
}

interface AdvisorLint {
  level?: "WARN" | "ERROR" | "INFO" | string;
  name?: string;
  title?: string;
}

// NEXT_PUBLIC_SUPABASE_URL → project_ref. 예: https://abc123.supabase.co → abc123
function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname; // abc123.supabase.co
    const ref = host.split(".")[0];
    if (!ref || ref.length < 8) return null; // 안전 가드 — 잘못된 URL 차단
    return ref;
  } catch {
    return null;
  }
}

async function supabaseFetch<T>(path: string): Promise<T> {
  const token = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Supabase ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// pure function — 점검 입력 → alerts/kpis. 단위 테스트 + main 둘 다 호출.
export function buildSupabaseAlerts(input: {
  project: SupabaseProject;
  advisorWarn: number;
  advisorError: number;
}): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const { project, advisorWarn, advisorError } = input;
  const alerts: ConsoleAlert[] = [];
  const status = project.status ?? "UNKNOWN";

  // 정상 = ACTIVE_HEALTHY 만. 그 외는 사장님 즉시 알림.
  if (status !== "ACTIVE_HEALTHY") {
    alerts.push({
      key: "supabase_project_unhealthy",
      message: `Supabase 프로젝트 상태 ${status} (정상=ACTIVE_HEALTHY).`,
      recommendation:
        "Supabase 대시보드 → Project Settings 에서 상태 확인. PAUSED 면 Free tier 휴면 가능성 (활성화 필요)",
    });
  }

  // ERROR 레벨 advisor 는 즉시 표시 (RLS 누락 같은 보안 위험).
  if (advisorError >= 1) {
    alerts.push({
      key: "supabase_advisor_error",
      message: `Supabase advisor ERROR ${advisorError}건 (보안 사고 위험).`,
      recommendation:
        "https://supabase.com/dashboard/project/_/advisors/security 즉시 점검",
    });
  }

  // WARN 5건+ — 자연 누적 임계 초과
  if (advisorWarn >= ADVISOR_WARN_THRESHOLD) {
    alerts.push({
      key: "supabase_advisor_warn",
      message: `Supabase advisor WARN ${advisorWarn}건 (임계 ${ADVISOR_WARN_THRESHOLD}+).`,
      recommendation:
        "https://supabase.com/dashboard/project/_/advisors/security 검수 후 RLS·인덱스 보강",
    });
  }

  return {
    alerts,
    kpis: {
      project_status: status,
      project_name: project.name ?? null,
      project_region: project.region ?? null,
      advisor_warn: advisorWarn,
      advisor_error: advisorError,
    },
  };
}

// console checker — cron route 에서 호출.
export async function checkSupabase(): Promise<ConsoleCheckResult> {
  const token = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const projectRef = getProjectRef();

  if (!token) {
    return {
      console: "supabase",
      alerts: [],
      kpis: {},
      error: "skipped: SUPABASE_PERSONAL_ACCESS_TOKEN missing",
    };
  }
  if (!projectRef) {
    return {
      console: "supabase",
      alerts: [],
      kpis: {},
      error: "skipped: project_ref 추출 실패 (NEXT_PUBLIC_SUPABASE_URL 확인)",
    };
  }

  try {
    // 두 endpoint 병렬 호출 — Management API 는 rate limit 여유 있음
    const [project, advisor] = await Promise.all([
      supabaseFetch<SupabaseProject>(`/v1/projects/${projectRef}`),
      supabaseFetch<{ lints?: AdvisorLint[] }>(
        `/v1/projects/${projectRef}/advisors/security`,
      ),
    ]);

    const lints = advisor.lints ?? [];
    const advisorWarn = lints.filter((l) => l.level === "WARN").length;
    const advisorError = lints.filter((l) => l.level === "ERROR").length;

    const { alerts, kpis } = buildSupabaseAlerts({
      project,
      advisorWarn,
      advisorError,
    });
    return { console: "supabase", alerts, kpis };
  } catch (e) {
    return {
      console: "supabase",
      alerts: [
        {
          key: "supabase_fetch_failed",
          message: `Supabase Management API 호출 실패: ${(e as Error).message.slice(0, 120)}`,
          recommendation:
            "SUPABASE_PERSONAL_ACCESS_TOKEN 만료 가능성 — supabase.com/dashboard/account/tokens 재발급",
        },
      ],
      kpis: {},
      error: (e as Error).message,
    };
  }
}

export type { AdvisorLint };
