// ============================================================
// AdSense console 자동 점검 (Phase 3 외부 console — 4 backlog #3)
// ============================================================
// AdSense Management API v2 호출 — 계정 상태 + 24h 수익.
// 인증: OAuth 2.0 refresh_token → access_token 자동 발급.
// env: ADSENSE_CLIENT_ID / ADSENSE_CLIENT_SECRET / ADSENSE_REFRESH_TOKEN
//
// 점검:
//   - account.state != READY → adsense_account_state (승인 보류·정지 즉시 알림)
//   - 24h 수익 0 + 광고 단위 1+ → adsense_zero_revenue (트래픽 0 사고 신호)
//
// env 미설정 시 graceful skip (kakao.ts 패턴 동일).
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const ADSENSE_API = "https://adsense.googleapis.com/v2";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FETCH_TIMEOUT_MS = 15000;

interface AdSenseAccount {
  name: string; // 예: accounts/pub-1234567890
  displayName?: string;
  /** READY / NEEDS_ATTENTION / WARNING / DISABLED / CLOSED */
  state?: string;
}

interface AdSenseReportCell {
  value?: string;
}
interface AdSenseReport {
  totals?: { cells?: AdSenseReportCell[] };
  rows?: { cells?: AdSenseReportCell[] }[];
}

// refresh_token → access_token (1회 호출 1시간 유효, 점검당 1번 발급).
async function getAccessToken(): Promise<string> {
  const clientId = process.env.ADSENSE_CLIENT_ID!;
  const clientSecret = process.env.ADSENSE_CLIENT_SECRET!;
  const refreshToken = process.env.ADSENSE_REFRESH_TOKEN!;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`token refresh ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token refresh: access_token 누락");
  return data.access_token;
}

async function googleFetch<T>(
  url: string,
  token: string,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AdSense ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// pure function — fetch 결과 → alerts/kpis. 단위 테스트 + checkAdsense 둘 다 호출.
export function buildAdsenseAlerts(input: {
  account: AdSenseAccount;
  earningsToday: number; // USD
  currency: string;
}): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const { account, earningsToday, currency } = input;
  const alerts: ConsoleAlert[] = [];
  const state = account.state ?? "UNKNOWN";

  // 계정 상태 — READY 아니면 모두 alert (NEEDS_ATTENTION/WARNING/DISABLED/CLOSED)
  if (state !== "READY") {
    alerts.push({
      key: "adsense_account_state",
      message: `AdSense 계정 상태 ${state} (정상=READY).`,
      recommendation:
        "AdSense 콘솔 (adsense.google.com) 로그인 → 정책 위반·결제 정보 확인",
    });
  }

  // 24h 수익 0 — READY 인데 수익 0 이면 트래픽 0 또는 광고 차단 의심
  if (state === "READY" && earningsToday === 0) {
    alerts.push({
      key: "adsense_zero_revenue",
      message: `AdSense 24h 수익 ${currency} 0 — 트래픽 0 또는 광고 차단 의심.`,
      recommendation:
        "AdSense 콘솔 → 광고 단위 활성 + ads.txt 파일 확인 + GA4 트래픽 비교",
    });
  }

  return {
    alerts,
    kpis: {
      account_name: account.name,
      account_state: state,
      earnings_today: earningsToday,
      currency,
    },
  };
}

// console checker — cron route 에서 호출.
export async function checkAdsense(): Promise<ConsoleCheckResult> {
  if (
    !process.env.ADSENSE_CLIENT_ID ||
    !process.env.ADSENSE_CLIENT_SECRET ||
    !process.env.ADSENSE_REFRESH_TOKEN
  ) {
    return {
      console: "adsense",
      alerts: [],
      kpis: {},
      error: "skipped: AdSense credentials missing",
    };
  }

  try {
    const token = await getAccessToken();

    // 1) accounts list — 첫 계정 사용 (keepioo 단일 계정 전제)
    const accs = await googleFetch<{ accounts?: AdSenseAccount[] }>(
      `${ADSENSE_API}/accounts`,
      token,
    );
    const account = accs.accounts?.[0];
    if (!account) throw new Error("AdSense 계정 없음 — 승인 후 재시도");

    // 2) 24h 수익 (TODAY) — metrics=ESTIMATED_EARNINGS
    const reportUrl = `${ADSENSE_API}/${account.name}/reports:generate?dateRange=TODAY&metrics=ESTIMATED_EARNINGS`;
    const report = await googleFetch<AdSenseReport>(reportUrl, token);
    const cell = report.totals?.cells?.[0]?.value ?? "0";
    const earningsToday = parseFloat(cell) || 0;
    // currency 는 별도 metric 이지만 단순화 — 사장님 한국 가입 USD default
    const currency = "USD";

    const { alerts, kpis } = buildAdsenseAlerts({
      account,
      earningsToday,
      currency,
    });
    return { console: "adsense", alerts, kpis };
  } catch (e) {
    return {
      console: "adsense",
      alerts: [
        {
          key: "adsense_fetch_failed",
          message: `AdSense API 호출 실패: ${(e as Error).message.slice(0, 120)}`,
          recommendation:
            "ADSENSE_REFRESH_TOKEN 만료 가능성 — Google OAuth Playground 에서 재발급",
        },
      ],
      kpis: {},
      error: (e as Error).message,
    };
  }
}
