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
// 2026-05-19 (저녁) — headers[].currencyCode 추출 위해 추가. ESTIMATED_EARNINGS metric 의 publisher 계정 default currency 가 headers[N].currencyCode 로 옴 (예: "USD").
interface AdSenseReportHeader {
  name?: string;
  type?: string;
  currencyCode?: string;
}
interface AdSenseReport {
  headers?: AdSenseReportHeader[];
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
  earningsToday: number;
  currency: string;
  // 2026-05-19 — 광고 노출·클릭 metric 확장 (AdSense 봇 crawl 감지)
  impressions?: number;
  clicks?: number;
  adRequests?: number;
  pageViews?: number;
  // 2026-05-19 — state=READY 가 된 시점 (KST). 24h 미경과 시 zero_impressions alert skip.
  // 검수 통과 직후 1~24h 광고 채워지기 전 false positive 차단 (review 권고).
  readySinceHours?: number;
}): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const { account, earningsToday, currency, impressions, clicks, adRequests, pageViews, readySinceHours } = input;
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

  // 2026-05-19 — 24h 노출 0 (READY 인데 광고 요청·표시 0 = AdSense 봇 crawl 부재 또는 광고 코드 미작동)
  // grace period — READY 가 된 후 24h 미경과 시 alert skip (광고 채워지기 1~24h 정상)
  if (
    state === "READY" &&
    impressions !== undefined &&
    impressions === 0 &&
    adRequests !== undefined &&
    adRequests === 0 &&
    (readySinceHours === undefined || readySinceHours >= 24)
  ) {
    alerts.push({
      key: "adsense_zero_impressions",
      message: `AdSense 24h 노출·요청 0 — 광고 코드 미작동 또는 ads.txt 인식 지연.`,
      recommendation:
        "lib/ad-slot.tsx 의 ADSENSE_PUBLISHER_ID env 확인 + 모바일 keepioo.com 직접 광고 노출 확인 + Mediapartners-Google 봇 robots.txt allow 확인",
    });
  }

  return {
    alerts,
    kpis: {
      account_name: account.name,
      account_state: state,
      earnings_today: earningsToday,
      currency,
      impressions: impressions ?? null,
      clicks: clicks ?? null,
      ad_requests: adRequests ?? null,
      page_views: pageViews ?? null,
      ready_since_hours: readySinceHours ?? null,
      // 노출당 클릭률 (CTR) — impressions > 0 일 때만
      ctr_pct:
        impressions !== undefined && impressions > 0 && clicks !== undefined
          ? Math.round((clicks / impressions) * 10000) / 100
          : null,
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
    // 계정 없음 — 승인 대기/publisher ID 미연결 case. throw 대신 안내 alert 1건
    // 반환해서 adsense_fetch_failed 매일 폭주 사고 방지 (2026-05-10 spec).
    if (!account) {
      return {
        console: "adsense",
        alerts: [
          {
            key: "adsense_account_state",
            message: "AdSense 계정 없음 — 승인 대기 중 또는 publisher ID 미연결.",
            recommendation:
              "AdSense 콘솔 (adsense.google.com) → 계정 → 승인 상태 확인. 7일 이상 미진행 시 Google 지원 문의.",
          },
        ],
        kpis: { account_state: "NOT_FOUND" },
      };
    }

    // 2) 24h 수익 + 노출 + 클릭 (TODAY) — 2026-05-19 metric 확장
    // metrics: ESTIMATED_EARNINGS, IMPRESSIONS, CLICKS, AD_REQUESTS, PAGE_VIEWS
    // totals.cells 순서 = metrics 파라미터 순서.
    const reportUrl = `${ADSENSE_API}/${account.name}/reports:generate?dateRange=TODAY&metrics=ESTIMATED_EARNINGS&metrics=IMPRESSIONS&metrics=CLICKS&metrics=AD_REQUESTS&metrics=PAGE_VIEWS`;
    const report = await googleFetch<AdSenseReport>(reportUrl, token);
    const cells = report.totals?.cells ?? [];
    const earningsToday = parseFloat(cells[0]?.value ?? "0") || 0;
    const impressions = parseInt(cells[1]?.value ?? "0", 10) || 0;
    const clicks = parseInt(cells[2]?.value ?? "0", 10) || 0;
    const adRequests = parseInt(cells[3]?.value ?? "0", 10) || 0;
    const pageViews = parseInt(cells[4]?.value ?? "0", 10) || 0;
    // 2026-05-19 (저녁) — AdSense API 응답의 headers[].currencyCode 추출.
    // 옛 코드 `?? "KRW"` 가 사고였음: 사장님 publisher 계정 default = USD 인데
    // 코드가 KRW 라벨 강제 → hub 매출 카드가 "25.53 KRW" 로 1,300배 적게 표시
    // (실제 25.53 USD = 약 33,950원). 5/19 콘솔 직접 확인으로 발견.
    // 우선순위: env override (다국가 운영 강제) → API headers → "USD" fallback.
    const earningsHeader = report.headers?.find(
      (h) => h.name === "ESTIMATED_EARNINGS",
    );
    const currency =
      process.env.ADSENSE_CURRENCY ??
      earningsHeader?.currencyCode ??
      "USD";

    // 2026-05-19 — readySinceHours 계산 (admin_actions adsense_review_state 의 가장 오래된 READY row).
    // grace period: READY 직후 24h 미경과 시 zero_impressions alert skip.
    let readySinceHours: number | undefined;
    if (account.state === "READY") {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const adminDb = createAdminClient();
        const { data: firstReady } = await adminDb
          .from("admin_actions")
          .select("created_at")
          .eq("action", "adsense_review_state")
          .filter("details->>state", "eq", "READY")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstReady?.created_at) {
          const ms = Date.now() - new Date(firstReady.created_at).getTime();
          readySinceHours = Math.floor(ms / 3600_000);
        }
      } catch {
        // graceful — readySinceHours undefined 시 buildAdsenseAlerts default 동작 (alert 발동)
      }
    }

    const { alerts, kpis } = buildAdsenseAlerts({
      account,
      earningsToday,
      currency,
      impressions,
      clicks,
      adRequests,
      pageViews,
      readySinceHours,
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
