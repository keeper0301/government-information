// ============================================================
// GA4 console 자동 점검 (Phase 3 외부 console)
// ============================================================
// Google Analytics Data API v1 호출 — 24h 트래픽·세션·이탈률.
// 인증: OAuth 2.0 refresh_token (AdSense 와 같은 패턴, 다른 scope).
// env: GA4_PROPERTY_ID / GA4_CLIENT_ID / GA4_CLIENT_SECRET / GA4_REFRESH_TOKEN
//
// 점검:
//   - ga4_no_traffic — 24h activeUsers 0 (사이트 다운/광고 차단/검색엔진 사고)
//   - ga4_high_bounce — bounceRate >= 90% (페이지 품질 저하)
//   - ga4_fetch_failed — API 호출 실패
//
// env 4종 미설정 시 graceful skip.
// ============================================================

import type { ConsoleCheckResult, ConsoleAlert } from "./types";

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FETCH_TIMEOUT_MS = 15000;

interface GA4MetricValue {
  value?: string;
}
interface GA4Row {
  metricValues?: GA4MetricValue[];
}
interface GA4ReportResponse {
  rows?: GA4Row[];
  totals?: GA4Row[];
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GA4_CLIENT_ID!;
  const clientSecret = process.env.GA4_CLIENT_SECRET!;
  const refreshToken = process.env.GA4_REFRESH_TOKEN!;

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

async function runReport(
  token: string,
  propertyId: string,
): Promise<GA4ReportResponse> {
  const url = `${GA4_API}/properties/${propertyId}:runReport`;
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
      body: JSON.stringify({
        // 어제 ~ 오늘 = 약 24h~48h. 새벽 cron 실행 시점도 활성 데이터 안정.
        dateRanges: [{ startDate: "yesterday", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "bounceRate" },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GA4 ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as GA4ReportResponse;
  } finally {
    clearTimeout(timer);
  }
}

// pure function — totals 추출 + alert 생성. 단위 테스트 + main 둘 다 호출.
export function buildGa4Alerts(input: {
  activeUsers: number;
  sessions: number;
  bounceRate: number; // 0~1
}): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const { activeUsers, sessions, bounceRate } = input;
  const alerts: ConsoleAlert[] = [];

  if (activeUsers === 0) {
    alerts.push({
      key: "ga4_no_traffic",
      message: `GA4 24h 사용자 0명 (세션 ${sessions}). 사이트 다운/검색엔진 사고/측정 ID 오설정 의심.`,
      recommendation:
        "사이트 가용성 + GA4 측정 ID + Search Console 인덱싱 상태 확인",
    });
  }

  if (activeUsers > 0 && bounceRate >= 0.9) {
    alerts.push({
      key: "ga4_high_bounce",
      message: `GA4 24h 이탈률 ${Math.round(bounceRate * 100)}% (≥90%). 페이지 품질·로딩 속도 점검 필요.`,
      recommendation:
        "느린 페이지 / 잘못된 링크 / 모바일 깨짐 점검. /admin/health 응답시간 확인",
    });
  }

  return {
    alerts,
    kpis: {
      active_users: activeUsers,
      sessions,
      bounce_rate: Number(bounceRate.toFixed(3)),
    },
  };
}

function parseTotals(report: GA4ReportResponse): {
  activeUsers: number;
  sessions: number;
  bounceRate: number;
} {
  const cells = report.totals?.[0]?.metricValues ?? [];
  return {
    activeUsers: parseInt(cells[0]?.value ?? "0", 10) || 0,
    sessions: parseInt(cells[1]?.value ?? "0", 10) || 0,
    bounceRate: parseFloat(cells[2]?.value ?? "0") || 0,
  };
}

export async function checkGa4(): Promise<ConsoleCheckResult> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (
    !propertyId ||
    !process.env.GA4_CLIENT_ID ||
    !process.env.GA4_CLIENT_SECRET ||
    !process.env.GA4_REFRESH_TOKEN
  ) {
    return {
      console: "ga4",
      alerts: [],
      kpis: {},
      error: "skipped: GA4 credentials missing",
    };
  }

  try {
    const token = await getAccessToken();
    const report = await runReport(token, propertyId);
    const totals = parseTotals(report);
    const { alerts, kpis } = buildGa4Alerts(totals);
    return { console: "ga4", alerts, kpis };
  } catch (e) {
    return {
      console: "ga4",
      alerts: [
        {
          key: "ga4_fetch_failed",
          message: `GA4 API 호출 실패: ${(e as Error).message.slice(0, 120)}`,
          recommendation:
            "GA4_REFRESH_TOKEN 만료 또는 service account 권한 회수 가능성 — 가이드 Step 3 재실행",
        },
      ],
      kpis: {},
      error: (e as Error).message,
    };
  }
}
