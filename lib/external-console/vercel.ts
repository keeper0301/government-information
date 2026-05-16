// ============================================================
// Vercel 배포 환경 점검 (Phase 3 외부 console)
// ============================================================
// Vercel REST API v6 호출 — 최근 production 배포 상태 + 24h 실패율.
// 인증: Bearer PAT (process.env.VERCEL_TOKEN, 기존 봇 /env, /redeploy 와 같음).
// env: VERCEL_TOKEN (이미 prod 등록됨, reference_vercel_token_telegram_bot.md)
//
// 점검:
//   - vercel_last_deploy_failed — 가장 최근 prod 배포 state ∈ {ERROR, CANCELED}
//   - vercel_24h_high_failure   — 24h 안 prod 배포 실패율 ≥ 30% (3건 이상 표본)
//   - vercel_fetch_failed       — API 호출 자체 실패
//
// env 미설정 시 graceful skip (kakao/adsense 와 같은 패턴).
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const VERCEL_API = "https://api.vercel.com";
const PROJECT_NAME = "government-information";
const TEAM_SLUG = "keeper0301-8938s-projects";
const FETCH_TIMEOUT_MS = 15_000;

// state 분류 — Vercel 공식 deployment state.
// READY=성공, ERROR/CANCELED=실패, BUILDING/INITIALIZING/QUEUED=진행중 (집계 제외)
type DeployState =
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "BUILDING"
  | "INITIALIZING"
  | "QUEUED"
  | string;

export interface DeploymentRow {
  uid: string;
  state?: DeployState;
  createdAt?: number;
  target?: string | null;
}

function classifyState(state?: string): "success" | "failed" | "in_progress" {
  if (!state) return "in_progress";
  const s = state.toUpperCase();
  if (s === "READY") return "success";
  if (s === "ERROR" || s === "CANCELED") return "failed";
  return "in_progress"; // BUILDING/INITIALIZING/QUEUED
}

async function fetchRecentDeployments(): Promise<DeploymentRow[]> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN env 미설정");

  // 24h 안 prod 배포 — keepioo 평균 일 1~5회 push 라 limit 20 충분.
  const url =
    `${VERCEL_API}/v6/deployments?app=${PROJECT_NAME}` +
    `&target=production&limit=20&slug=${TEAM_SLUG}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Vercel ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as { deployments?: DeploymentRow[] };
    return data.deployments ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// pure function — 배포 배열 → alerts/kpis. 단위 테스트 + main 둘 다 호출.
export function buildVercelAlerts(deployments: DeploymentRow[]): {
  alerts: ConsoleAlert[];
  kpis: Record<string, unknown>;
} {
  const alerts: ConsoleAlert[] = [];
  const since24h = Date.now() - 24 * 3600_000;

  // 0건 — push 없는 날 정상. alert 안 함.
  if (deployments.length === 0) {
    return {
      alerts: [],
      kpis: {
        total_24h: 0,
        latest_state: null,
        info: "최근 prod 배포 없음 (push 0)",
      },
    };
  }

  // 가장 최근 prod 배포 (첫 번째 row 가 최신)
  const latest = deployments[0];
  const latestCls = classifyState(latest.state);

  // 24h 안 결정된 (성공/실패) 배포만 집계 — 진행중은 제외
  const decided24h = deployments.filter(
    (d) =>
      typeof d.createdAt === "number" &&
      d.createdAt >= since24h &&
      classifyState(d.state) !== "in_progress",
  );
  const failed24h = decided24h.filter(
    (d) => classifyState(d.state) === "failed",
  ).length;
  const total24h = decided24h.length;
  const failureRate = total24h === 0 ? 0 : failed24h / total24h;

  // 최근 prod 배포 실패 — 가장 즉시성 있는 신호
  if (latestCls === "failed") {
    alerts.push({
      key: "vercel_last_deploy_failed",
      message: `최근 prod 배포 ${latest.state} (uid=${latest.uid.slice(0, 12)}).`,
      recommendation:
        "Vercel 대시보드 → Deployments → 해당 배포 build log 확인. 필요 시 텔레그램 봇 /redeploy 로 재배포",
    });
  }

  // 24h 실패율 ≥ 30% (표본 3건 이상) — 연속 실패 패턴 신호
  if (total24h >= 3 && failureRate >= 0.3) {
    alerts.push({
      key: "vercel_24h_high_failure",
      message: `24h prod 배포 실패율 ${Math.round(failureRate * 100)}% (${failed24h}/${total24h}).`,
      recommendation:
        "GitHub Actions CI 결과 + Vercel build log 확인. typecheck/test 회귀 가능성",
    });
  }

  return {
    alerts,
    kpis: {
      total_24h: total24h,
      failed_24h: failed24h,
      failure_rate: Number(failureRate.toFixed(3)),
      latest_state: latest.state ?? "UNKNOWN",
      latest_uid: latest.uid,
    },
  };
}

// console checker — cron route 에서 호출.
export async function checkVercel(): Promise<ConsoleCheckResult> {
  if (!process.env.VERCEL_TOKEN) {
    return {
      console: "vercel",
      alerts: [],
      kpis: {},
      error: "skipped: VERCEL_TOKEN missing",
    };
  }

  try {
    const deployments = await fetchRecentDeployments();
    const { alerts, kpis } = buildVercelAlerts(deployments);
    return { console: "vercel", alerts, kpis };
  } catch (e) {
    return {
      console: "vercel",
      alerts: [
        {
          key: "vercel_fetch_failed",
          message: `Vercel API 호출 실패: ${(e as Error).message.slice(0, 120)}`,
          recommendation:
            "VERCEL_TOKEN 만료 가능성 — Vercel Account → Tokens 에서 재발급",
        },
      ],
      kpis: {},
      error: (e as Error).message,
    };
  }
}

