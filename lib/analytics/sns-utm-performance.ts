// ============================================================
// SNS UTM 성과 요약 (Threads lead A/B + 채널별 클릭 품질)
// ============================================================
// GA4 Data API에서 session UTM 차원을 읽어 /admin/sns-control-tower에
// "발행했다"가 아니라 "클릭을 만들었는지"를 보여준다.
// env 미설정/권한 오류는 운영 콘솔을 깨지 않도록 graceful error로 반환.
// ============================================================

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FETCH_TIMEOUT_MS = 15000;

export type SnsUtmSource = "threads" | "twitter" | "facebook";

export type SnsUtmPerformanceRow = {
  source: SnsUtmSource;
  content: string;
  sessions: number;
  activeUsers: number;
};

export type SnsUtmPerformance = {
  ready: boolean;
  windowDays: number;
  rows: SnsUtmPerformanceRow[];
  totals: {
    sessions: number;
    activeUsers: number;
  };
  bestContent: SnsUtmPerformanceRow | null;
  error: string | null;
};

type GA4RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

function parsePositiveInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isSnsSource(value: string): value is SnsUtmSource {
  return value === "threads" || value === "twitter" || value === "facebook";
}

export function parseSnsUtmPerformanceRows(report: GA4RunReportResponse): SnsUtmPerformanceRow[] {
  const grouped = new Map<string, SnsUtmPerformanceRow>();

  for (const row of report.rows ?? []) {
    const source = row.dimensionValues?.[0]?.value ?? "";
    const medium = row.dimensionValues?.[1]?.value ?? "";
    const campaign = row.dimensionValues?.[2]?.value ?? "";
    const content = row.dimensionValues?.[3]?.value || "(not set)";
    if (!isSnsSource(source) || medium !== "social" || campaign !== "blog_auto") continue;

    const key = `${source}::${content}`;
    const prev = grouped.get(key) ?? { source, content, sessions: 0, activeUsers: 0 };
    prev.sessions += parsePositiveInt(row.metricValues?.[0]?.value);
    prev.activeUsers += parsePositiveInt(row.metricValues?.[1]?.value);
    grouped.set(key, prev);
  }

  return [...grouped.values()].sort((a, b) => {
    const bySessions = b.sessions - a.sessions;
    if (bySessions !== 0) return bySessions;
    return b.activeUsers - a.activeUsers;
  });
}

export function summarizeSnsUtmPerformance(
  rows: SnsUtmPerformanceRow[],
  windowDays: number,
  error: string | null = null,
): SnsUtmPerformance {
  const totals = rows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      activeUsers: acc.activeUsers + row.activeUsers,
    }),
    { sessions: 0, activeUsers: 0 },
  );
  return {
    ready: !error,
    windowDays,
    rows,
    totals,
    bestContent: rows[0] ?? null,
    error,
  };
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GA4_CLIENT_ID!,
      client_secret: process.env.GA4_CLIENT_SECRET!,
      refresh_token: process.env.GA4_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`token refresh ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token refresh: access_token 누락");
  return data.access_token;
}

async function runUtmReport(token: string, propertyId: string, windowDays: number): Promise<GA4RunReportResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({
        dateRanges: [{ startDate: `${windowDays}daysAgo`, endDate: "today" }],
        dimensions: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
          { name: "sessionManualAdContent" },
        ],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "100",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GA4 ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as GA4RunReportResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSnsUtmPerformance(windowDays = 30): Promise<SnsUtmPerformance> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId || !process.env.GA4_CLIENT_ID || !process.env.GA4_CLIENT_SECRET || !process.env.GA4_REFRESH_TOKEN) {
    return summarizeSnsUtmPerformance([], windowDays, "GA4 credentials missing");
  }

  try {
    const token = await getAccessToken();
    const report = await runUtmReport(token, propertyId, windowDays);
    return summarizeSnsUtmPerformance(parseSnsUtmPerformanceRows(report), windowDays);
  } catch (error) {
    return summarizeSnsUtmPerformance(
      [],
      windowDays,
      error instanceof Error ? error.message : String(error),
    );
  }
}
