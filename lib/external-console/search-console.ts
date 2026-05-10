// ============================================================
// Search Console 자동 점검 (Phase 3 외부 console)
// ============================================================
// Google Search Analytics API v3 호출 — 최근 3일 ~ 어제 클릭·노출·CTR·평균 순위.
// 인증: OAuth 2.0 refresh_token (AdSense·GA4 와 같은 패턴, scope 만 다름).
// env: SC_SITE_URL / SC_CLIENT_ID / SC_CLIENT_SECRET / SC_REFRESH_TOKEN
// scope: https://www.googleapis.com/auth/webmasters.readonly
//
// 점검:
//   - sc_no_clicks   — 최근 3일 클릭 0 (색인 제외·robots 사고·도메인 차단 의심)
//   - sc_low_ctr     — 노출 ≥ 100 + CTR < 0.5% (제목·meta 품질 저하 신호)
//   - sc_fetch_failed — token 만료 또는 권한 없음
//
// env 미설정 시 graceful skip (kakao/adsense/ga4 와 같은 패턴).
// AdSense 재거절 원인 추적에 유용 — 색인 이슈 즉시 SMS.
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const SC_API = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FETCH_TIMEOUT_MS = 15_000;
const MS_PER_DAY = 86_400_000;
const LOW_CTR_THRESHOLD = 0.005;       // 0.5%
const LOW_CTR_MIN_IMPRESSIONS = 100;

interface SearchAnalyticsRow {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.SC_CLIENT_ID!;
  const clientSecret = process.env.SC_CLIENT_SECRET!;
  const refreshToken = process.env.SC_REFRESH_TOKEN!;

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

// Search Console 데이터 lag 1~2일 — startDate=3일전, endDate=1일전 보수적 안전 범위.
function dateRange(): { startDate: string; endDate: string } {
  const now = Date.now();
  const start = new Date(now - 3 * MS_PER_DAY).toISOString().slice(0, 10);
  const end = new Date(now - 1 * MS_PER_DAY).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

async function querySearchAnalytics(
  token: string,
  siteUrl: string,
): Promise<SearchAnalyticsResponse> {
  // siteUrl 은 "sc-domain:keepioo.com" 또는 "https://www.keepioo.com/" — URL encode 필수
  const url = `${SC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({ ...dateRange(), rowLimit: 1 }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Search Console ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as SearchAnalyticsResponse;
  } finally {
    clearTimeout(timer);
  }
}

// pure function — 응답 → alerts/kpis. 단위 테스트 + main 둘 다 호출.
export function buildSearchConsoleAlerts(input: {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const { clicks, impressions, ctr, position } = input;
  const alerts: ConsoleAlert[] = [];

  // 클릭 0 — 색인 제외·robots 차단·도메인 사고 의심
  if (clicks === 0) {
    alerts.push({
      key: "sc_no_clicks",
      message: `Search Console 최근 3일 클릭 0 (노출 ${impressions}). 색인·robots·도메인 차단 의심.`,
      recommendation:
        "Search Console → 색인 생성 범위 + robots.txt + 도메인 소유권 확인. AdSense 재거절 원인 추적 시 우선",
    });
  }

  // 저 CTR — 노출 충분한데 클릭 안 됨 (제목·meta 매력 저하)
  if (
    impressions >= LOW_CTR_MIN_IMPRESSIONS &&
    ctr > 0 &&
    ctr < LOW_CTR_THRESHOLD
  ) {
    alerts.push({
      key: "sc_low_ctr",
      message: `Search Console CTR ${(ctr * 100).toFixed(2)}% (< 0.5%). 노출 ${impressions} 대비 클릭 ${clicks}.`,
      recommendation:
        "제목·meta description 매력 보강. /admin/blog-quality 또는 long-tail 신규 발행 검토",
    });
  }

  return {
    alerts,
    kpis: {
      clicks,
      impressions,
      ctr: Number(ctr.toFixed(4)),
      avg_position: Number(position.toFixed(2)),
    },
  };
}

function parseTotals(report: SearchAnalyticsResponse) {
  const row = report.rows?.[0] ?? {};
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

export async function checkSearchConsole(): Promise<ConsoleCheckResult> {
  const siteUrl = process.env.SC_SITE_URL;
  if (
    !siteUrl ||
    !process.env.SC_CLIENT_ID ||
    !process.env.SC_CLIENT_SECRET ||
    !process.env.SC_REFRESH_TOKEN
  ) {
    return {
      console: "search_console",
      alerts: [],
      kpis: {},
      error: "skipped: Search Console credentials missing",
    };
  }

  try {
    const token = await getAccessToken();
    const report = await querySearchAnalytics(token, siteUrl);
    const totals = parseTotals(report);
    const { alerts, kpis } = buildSearchConsoleAlerts(totals);
    return { console: "search_console", alerts, kpis };
  } catch (e) {
    return {
      console: "search_console",
      alerts: [
        {
          key: "sc_fetch_failed",
          message: `Search Console API 호출 실패: ${(e as Error).message.slice(0, 120)}`,
          recommendation:
            "SC_REFRESH_TOKEN 만료 또는 사이트 권한 회수 가능성 — 가이드 Step 3 재실행",
        },
      ],
      kpis: {},
      error: (e as Error).message,
    };
  }
}
