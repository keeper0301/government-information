// ============================================================
// SNS UTM 성과 요약 (Threads lead A/B + 채널별 클릭 품질)
// ============================================================
// GA4 Data API에서 session UTM 차원을 읽어 /admin/sns-control-tower에
// "발행했다"가 아니라 "클릭을 만들었는지"를 보여준다.
// env 미설정/권한 오류는 운영 콘솔을 깨지 않도록 graceful error로 반환.
// ============================================================

import {
  CHALLENGER_LEAD_VARIANTS,
  DEFAULT_ACTIVE_LEAD_VARIANTS,
  LEAD_VARIANTS,
  type SnsLeadVariant,
} from "@/lib/sns-control-tower/lead-policy";

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

export type SnsLeadRecommendationStatus = "keep" | "pause" | "watch" | "needs_data";
export type SnsLeadExperimentAction = "baseline" | "expand" | "pause" | "watch" | "needs_data";

export type SnsLeadRecommendation = {
  content: SnsLeadVariant;
  sessions: number;
  activeUsers: number;
  sharePct: number;
  status: SnsLeadRecommendationStatus;
  reason: string;
  experiment: {
    action: SnsLeadExperimentAction;
    label: string;
    reason: string;
    coreAverageSessions: number;
    minSessions: number;
    pauseBelowPct: number;
    expandAbovePct: number;
  };
  pauseImpact: {
    lostSessions: number;
    lostActiveUsers: number;
    remainingLeadCount: number;
    riskLabel: "낮음" | "중간" | "높음" | "판단 보류";
    summary: string;
  };
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
  leadRecommendations: SnsLeadRecommendation[];
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
    leadRecommendations: buildLeadRecommendations(rows),
    error,
  };
}

export function buildLeadRecommendations(rows: SnsUtmPerformanceRow[]): SnsLeadRecommendation[] {
  const leadIds = LEAD_VARIANTS;
  const threadRows = new Map(
    rows
      .filter((row) => row.source === "threads" && leadIds.includes(row.content as SnsLeadVariant))
      .map((row) => [row.content as SnsLeadVariant, row]),
  );
  const totalSessions = leadIds.reduce((sum, lead) => sum + (threadRows.get(lead)?.sessions ?? 0), 0);
  const sorted = leadIds
    .map((lead) => ({ lead, sessions: threadRows.get(lead)?.sessions ?? 0 }))
    .sort((a, b) => b.sessions - a.sessions);
  const winner = sorted[0];
  const second = sorted[1];
  const sampledLeadCount = leadIds.filter((lead) => (threadRows.get(lead)?.sessions ?? 0) > 0).length;
  const hasEnoughData = totalSessions >= 12 && sampledLeadCount >= 2;
  const coreAverageSessions = Math.round(
    DEFAULT_ACTIVE_LEAD_VARIANTS.reduce((sum, lead) => sum + (threadRows.get(lead)?.sessions ?? 0), 0) /
      DEFAULT_ACTIVE_LEAD_VARIANTS.length,
  );
  const experimentMinSessions = 30;
  const pauseBelowPct = 70;
  const expandAbovePct = 120;

  return leadIds.map((lead) => {
    const row = threadRows.get(lead);
    const sessions = row?.sessions ?? 0;
    const activeUsers = row?.activeUsers ?? 0;
    const sharePct = totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0;
    const remainingLeadCount = Math.max(0, leadIds.length - 1);
    const isChallenger = CHALLENGER_LEAD_VARIANTS.includes(lead);
    let status: SnsLeadRecommendationStatus = "needs_data";
    let reason = "Threads lead별 클릭 데이터가 아직 부족합니다. 최소 12세션 이상 쌓인 뒤 판단하세요.";
    let riskLabel: SnsLeadRecommendation["pauseImpact"]["riskLabel"] = "판단 보류";
    let impactSummary = `표본 부족: 중단하지 말고 더 발행하세요. 현재 중단 시 최근 ${sessions}세션을 포기하는 판단이 됩니다.`;
    let experiment: SnsLeadRecommendation["experiment"] = {
      action: isChallenger ? "needs_data" : "baseline",
      label: isChallenger ? "표본 부족" : "기준군",
      reason: isChallenger
        ? `challenger는 ${experimentMinSessions}세션 이상 쌓인 뒤 core 평균과 비교합니다.`
        : "core lead는 challenger 판정의 기준군입니다.",
      coreAverageSessions,
      minSessions: experimentMinSessions,
      pauseBelowPct,
      expandAbovePct,
    };

    if (hasEnoughData) {
      if (lead === winner.lead && sessions >= Math.max(5, second.sessions * 1.4)) {
        status = "keep";
        reason = `현재 ${sharePct}% 점유. 2위 대비 차이가 있어 유지 후보입니다.`;
      } else if (sessions === 0 || sessions <= Math.max(1, Math.floor(totalSessions / leadIds.length / 2))) {
        status = "pause";
        reason = `현재 ${sharePct}% 점유. 평균의 절반 이하라 중단/교체 후보입니다.`;
      } else {
        status = "watch";
        reason = `현재 ${sharePct}% 점유. 더 돌려보고 승자와 격차를 확인하세요.`;
      }

      if (sharePct >= 50 || sessions >= 8) {
        riskLabel = "높음";
      } else if (sessions > 0) {
        riskLabel = "중간";
      } else {
        riskLabel = "낮음";
      }
      impactSummary = `중단 시 최근 ${sessions}세션/${activeUsers}활성 사용자를 포기합니다. 남은 lead ${remainingLeadCount}종으로만 발행됩니다.`;
    }

    if (isChallenger && coreAverageSessions > 0) {
      const pauseCutoff = Math.floor((coreAverageSessions * pauseBelowPct) / 100);
      const expandCutoff = Math.ceil((coreAverageSessions * expandAbovePct) / 100);
      if (sessions < experimentMinSessions) {
        experiment = {
          ...experiment,
          action: "needs_data",
          label: "표본 부족",
          reason: `현재 ${sessions}세션. 최소 ${experimentMinSessions}세션 전에는 확대/중단 판단 금지.`,
        };
      } else if (sessions < pauseCutoff) {
        experiment = {
          ...experiment,
          action: "pause",
          label: "중단 후보",
          reason: `core 평균 ${coreAverageSessions}세션의 ${pauseBelowPct}% 미만(${pauseCutoff}세션 미만)이라 실험 종료/중단 후보입니다.`,
        };
      } else if (sessions >= expandCutoff) {
        experiment = {
          ...experiment,
          action: "expand",
          label: "확대 후보",
          reason: `core 평균 ${coreAverageSessions}세션의 ${expandAbovePct}% 이상(${expandCutoff}세션 이상)이라 제한 노출 확대 검토 후보입니다.`,
        };
      } else {
        experiment = {
          ...experiment,
          action: "watch",
          label: "관찰 유지",
          reason: `core 평균 ${coreAverageSessions}세션 대비 중립 구간입니다. 20% 제한 노출을 유지하고 더 봅니다.`,
        };
      }
    } else if (isChallenger && coreAverageSessions === 0) {
      experiment = {
        ...experiment,
        action: "needs_data",
        label: "기준 부족",
        reason: "core lead 기준 세션이 없어 challenger 성과비를 계산할 수 없습니다.",
      };
    }

    return {
      content: lead,
      sessions,
      activeUsers,
      sharePct,
      status,
      reason,
      experiment,
      pauseImpact: {
        lostSessions: sessions,
        lostActiveUsers: activeUsers,
        remainingLeadCount,
        riskLabel,
        summary: impactSummary,
      },
    };
  });
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
