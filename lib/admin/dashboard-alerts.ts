// lib/admin/dashboard-alerts.ts
// ============================================================
// 메인 대시보드 "지금 처리 필요" 배너 — 4 신호
// ============================================================
// cron 실패 / press-ingest 적체 / 만료 탈퇴 미처리 / advisor 보안 경고.
// advisor 호출은 외부 Management API → 24h module-level cache.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getPressIngestKpi } from "@/lib/press-ingest/filter";

export type DashboardAlert = {
  key:
    | "cron_failure"
    | "press_ingest_backlog"
    | "deletions_overdue"
    | "advisor_warn"
    | "system_error"; // F3 review 후속 — Promise.allSettled 한 RPC 실패 시 알림
  label: string;
  count: number;
  href: string;
};

const PRESS_INGEST_BACKLOG_THRESHOLD = 30;
const ADVISOR_FETCH_TIMEOUT_MS = 5000; // F5 review 후속 — Supabase API timeout 가드

// ─── advisor cache ───
// Supabase Management API 호출은 비용이 큼 (외부 fetch + rate limit).
// 같은 serverless instance 내에서 24h 동안 1회만 호출.
// Vercel serverless 는 instance pool 이라 모든 instance 가 24h 1회씩 호출 가능 —
// 그래도 매 요청마다 호출하는 것보다는 훨씬 적음.
let advisorCache: { fetchedAt: number; warnCount: number } | null = null;
const ADVISOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

// env 미설정 안내 — 1시간 1회로 제한 (매 요청 stderr 폭주 차단).
// review 후속 (I1): cache stamp 제거 후 매 요청 console.warn 가능성 → mute.
let advisorEnvWarnedAt = 0;
const ADVISOR_ENV_WARN_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/**
 * Supabase advisor security 의 WARN 레벨 카운트 조회.
 * 환경변수 미설정 시 graceful degrade — 0 반환 (alert 미노출).
 */
async function getAdvisorWarnCount(): Promise<number> {
  // 캐시 hit — 24h 내면 재사용
  if (advisorCache && Date.now() - advisorCache.fetchedAt < ADVISOR_CACHE_TTL_MS) {
    return advisorCache.warnCount;
  }

  const token = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  // 환경변수 미설정 — fetch 자체 skip
  // F5 review 후속: cache stamp 안 함 → 사장님이 env 추가하면 다음 요청에서 즉시 활성.
  // I1 review 후속: warn 은 1시간 1회만 (매 요청 폭주 차단).
  if (!token || !projectRef) {
    if (Date.now() - advisorEnvWarnedAt > ADVISOR_ENV_WARN_INTERVAL_MS) {
      console.warn(
        "[dashboard-alerts] SUPABASE_PERSONAL_ACCESS_TOKEN / SUPABASE_PROJECT_REF 미설정 — advisor 신호 skip",
      );
      advisorEnvWarnedAt = Date.now();
    }
    return 0;
  }

  // F5 review 후속: AbortController 5초 timeout — 외부 API 응답 안 와도 페이지 hang 방지.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ADVISOR_FETCH_TIMEOUT_MS);

  try {
    // F5 review 후속: projectRef 직접 치환 (`/_/` 슬러그 의존 X — 사장님 다중 프로젝트 시 안전)
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/advisors/security`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn("[dashboard-alerts] advisor fetch HTTP", res.status);
      // 실패 시에도 cache stamp — 5초마다 재시도 폭주 방지
      advisorCache = { fetchedAt: Date.now(), warnCount: 0 };
      return 0;
    }

    type AdvisorLint = { level: "WARN" | "ERROR" | "INFO" | string };
    type AdvisorResponse = { lints?: AdvisorLint[] };

    const data = (await res.json()) as AdvisorResponse;
    const warnCount = (data.lints ?? []).filter((l) => l.level === "WARN").length;
    advisorCache = { fetchedAt: Date.now(), warnCount };
    return warnCount;
  } catch (e) {
    clearTimeout(timeoutId);
    // AbortError 도 동일 graceful degrade — page render 진행
    const isAbort = e instanceof Error && e.name === "AbortError";
    console.warn(
      `[dashboard-alerts] advisor fetch ${isAbort ? "timeout" : "error"}:`,
      e,
    );
    advisorCache = { fetchedAt: Date.now(), warnCount: 0 };
    return 0;
  }
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 병렬 fetch — 외부 RPC 3회 (각 head:true count exact)
  // 한 RPC 실패 시 다른 신호 보존 (partial result 패턴)
  // 예: getPressIngestKpi() 가 throw 해도 cron / deletions 신호는 그대로 노출
  const results = await Promise.allSettled([
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24h),
    getPressIngestKpi(),
    admin
      .from("pending_deletions")
      .select("user_id", { count: "exact", head: true })
      .lt("scheduled_delete_at", nowIso),
  ]);

  const [cronSettled, pressSettled, deletionsSettled] = results;

  const alerts: DashboardAlert[] = [];

  // F3 review 후속 — silent failure 차단:
  // 모든 RPC rejected 면 사장님이 "alert 시스템 자체 오류" 인지 가능하게 fallback chip.
  // partial (한 두 개만 rejected) 면 살아있는 신호로 충분 → fallback 안 띄움.
  const allRejected =
    cronSettled.status === "rejected" &&
    pressSettled.status === "rejected" &&
    deletionsSettled.status === "rejected";
  if (allRejected) {
    alerts.push({
      key: "system_error",
      label: "alert 시스템 오류 (로그 확인)",
      count: 1,
      href: "/admin/cron-failures",
    });
  }

  // cron 실패 알림 — fulfilled 만 평가, rejected 면 console.warn 후 skip
  if (cronSettled.status === "fulfilled" && (cronSettled.value.count ?? 0) >= 1) {
    alerts.push({
      key: "cron_failure",
      label: "cron 실패 알림",
      count: cronSettled.value.count ?? 0,
      href: "/admin/cron-failures",
    });
  } else if (cronSettled.status === "rejected") {
    console.warn("[dashboard-alerts] cron_failure_log fetch 실패:", cronSettled.reason);
  }

  // press-ingest 광역 보도자료 후보 적체
  if (
    pressSettled.status === "fulfilled" &&
    pressSettled.value.candidates_24h >= PRESS_INGEST_BACKLOG_THRESHOLD
  ) {
    alerts.push({
      key: "press_ingest_backlog",
      label: "광역 보도자료 후보 적체",
      count: pressSettled.value.candidates_24h,
      href: "/admin/press-ingest",
    });
  } else if (pressSettled.status === "rejected") {
    console.warn("[dashboard-alerts] getPressIngestKpi 실패:", pressSettled.reason);
  }

  // 만료 탈퇴 미처리
  if (deletionsSettled.status === "fulfilled" && (deletionsSettled.value.count ?? 0) >= 1) {
    alerts.push({
      key: "deletions_overdue",
      label: "만료 탈퇴 미처리",
      count: deletionsSettled.value.count ?? 0,
      href: "/admin#user-search",
    });
  } else if (deletionsSettled.status === "rejected") {
    console.warn("[dashboard-alerts] pending_deletions fetch 실패:", deletionsSettled.reason);
  }

  // Supabase advisor 보안 경고 (24h cache, graceful degrade)
  // 위 Promise.allSettled 와 별개로 sequential — cache 가 24h 1회라 비용 무시.
  const advisorWarn = await getAdvisorWarnCount();
  if (advisorWarn >= 1) {
    alerts.push({
      key: "advisor_warn",
      label: "Supabase advisor 보안 경고",
      count: advisorWarn,
      href: "https://supabase.com/dashboard/project/_/advisors/security",
    });
  }

  return alerts;
}
