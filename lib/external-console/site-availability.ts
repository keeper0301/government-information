// ============================================================
// 사이트 가용성 점검 (Phase 3 외부 console — 즉시 가치 1단계)
// ============================================================
// keepioo.com 주요 페이지 5종 HEAD 요청으로 가용성·응답 시간 점검.
// Vercel 자체 다운 시에는 health-alert (DB 기반) 가 작동 못 하므로 별도 가용성
// 점검 cron 가치 있음.
//
// 외부 의존 0 (단순 fetch). chrome 자동화·OAuth 불필요 — 즉시 prototype 가능.
// 다른 console (AdSense·카카오·토스·GA4) 통합은 같은 ConsoleCheckResult 인터페이스로
// 같은 cron 에 추가만 하면 됨.
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

// 점검 대상 — 사장님 사이트 main 페이지 5종.
// /admin·/account 같은 인증 필요 페이지는 제외 (200/302 둘 다 정상이라 노이즈).
const TARGETS = [
  { path: "/", label: "홈" },
  { path: "/welfare", label: "복지 목록" },
  { path: "/loan", label: "대출 목록" },
  { path: "/news", label: "뉴스 목록" },
  { path: "/blog", label: "블로그 목록" },
] as const;

const RESPONSE_TIME_THRESHOLD_MS = 3000; // 3초 이상 → 느림 alert
const FETCH_TIMEOUT_MS = 8000; // 8초 timeout (Vercel 응답 보통 ~수백ms)

export interface CheckOneResult {
  path: string;
  label: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
}

// 1 페이지 점검 — HEAD 요청. timeout + 에러 모두 핸들링.
async function checkOne(
  baseUrl: string,
  target: (typeof TARGETS)[number],
): Promise<CheckOneResult> {
  const url = `${baseUrl}${target.path}`;
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      // bot 차단·캐시 우회 회피 — Vercel edge 가 caching 안 하도록
      cache: "no-store",
      headers: { "User-Agent": "keepioo-availability-check/1.0" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return {
      path: target.path,
      label: target.label,
      ok: res.ok, // 200~299
      status: res.status,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      path: target.path,
      label: target.label,
      ok: false,
      status: null,
      durationMs: Date.now() - start,
      error: (e as Error).message,
    };
  }
}

// alert 빌드 — pure function (단위 테스트 + checkSiteAvailability 둘 다 호출).
// fetch 결과 배열만 받아 alert 생성 → 중복 로직 0, 테스트 mock 단순.
export function buildAvailabilityAlerts(
  results: CheckOneResult[],
): ConsoleAlert[] {
  const alerts: ConsoleAlert[] = [];

  // 다운 페이지 — 5xx, timeout, network error
  const down = results.filter((r) => !r.ok);
  if (down.length > 0) {
    alerts.push({
      key: "site_down",
      message: `사이트 다운 ${down.length}/${results.length}건: ${down
        .map((d) => `${d.label}(${d.status ?? d.error?.slice(0, 30) ?? "fail"})`)
        .join(", ")}`,
      recommendation:
        "Vercel 대시보드 deploy 상태·function logs 확인 + DNS·도메인 만료 점검",
    });
  }

  // 느린 페이지 — 3초 이상 (정상 응답한 것 중)
  const slow = results.filter(
    (r) => r.ok && r.durationMs >= RESPONSE_TIME_THRESHOLD_MS,
  );
  if (slow.length > 0) {
    alerts.push({
      key: "site_slow",
      message: `사이트 응답 지연 ${slow.length}건 (≥${RESPONSE_TIME_THRESHOLD_MS}ms): ${slow
        .map((s) => `${s.label}(${s.durationMs}ms)`)
        .join(", ")}`,
      recommendation:
        "Vercel function 로그·DB 쿼리 시간 점검 (Supabase pgbouncer 부하 또는 cold start 가능성)",
    });
  }

  return alerts;
}

// 5 페이지 병렬 점검 + alert 집계
export async function checkSiteAvailability(
  baseUrl: string = "https://www.keepioo.com",
): Promise<ConsoleCheckResult> {
  const results = await Promise.all(
    TARGETS.map((t) => checkOne(baseUrl, t)),
  );

  return {
    console: "site",
    alerts: buildAvailabilityAlerts(results),
    kpis: {
      checked: results.length,
      ok_count: results.filter((r) => r.ok).length,
      avg_duration_ms: Math.round(
        results.reduce((s, r) => s + r.durationMs, 0) / results.length,
      ),
      max_duration_ms: Math.max(...results.map((r) => r.durationMs)),
      results,
    },
  };
}

export type { CheckOneResult };
