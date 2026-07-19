// ============================================================
// Instagram media insights client
// ============================================================
// Read-only Graph API helper. Used by cron to collect early performance
// signals for feed carousel posts: reach, saves, shares, profile activity.
// ============================================================

const API_BASE = "https://graph.instagram.com/v23.0";

export type InstagramInsightMetric = {
  name?: string;
  period?: string;
  values?: Array<{ value?: number | string }>;
  value?: number | string;
};

export type InstagramInsightResult = {
  mediaId: string;
  metrics: Record<string, number>;
  requestedMetrics: string | null;
  errors: Array<{ metrics: string; status?: number; message: string }>;
};

const METRIC_SETS = [
  "reach,saved,shares,profile_activity,total_interactions",
  "reach,saved,shares,profile_activity",
  "reach,saved,shares",
  "reach,saved",
  "reach",
];

const METRIC_FIELD_MAP: Record<string, string> = {
  reach: "reach",
  saved: "saved",
  saves: "saved",
  shares: "shares",
  profile_activity: "profile_activity",
  profile_visits: "profile_activity",
  total_interactions: "total_interactions",
  comments: "comments",
  likes: "likes",
};

function latestValue(metric: InstagramInsightMetric): number {
  const values = metric.values ?? [];
  const raw = values.length > 0 ? values[values.length - 1]?.value : metric.value;
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapInstagramInsights(data: InstagramInsightMetric[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of data) {
    const key = METRIC_FIELD_MAP[String(row.name ?? "")];
    if (key) out[key] = latestValue(row);
  }
  return out;
}

function graphErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) return error.message.slice(0, 300);
  }
  return fallback.slice(0, 300);
}

async function fetchMetricSet(
  mediaId: string,
  token: string,
  metrics: string,
): Promise<{ data: InstagramInsightMetric[] }> {
  const params = new URLSearchParams({ metric: metrics, access_token: token });
  const res = await fetch(`${API_BASE}/${encodeURIComponent(mediaId)}/insights?${params.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    data?: InstagramInsightMetric[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw Object.assign(new Error(graphErrorMessage(json, `HTTP ${res.status}`)), { status: res.status });
  }
  return { data: json.data ?? [] };
}

export async function collectInstagramMediaInsights(
  mediaId: string,
  token: string,
): Promise<InstagramInsightResult> {
  const errors: InstagramInsightResult["errors"] = [];
  for (const metricSet of METRIC_SETS) {
    try {
      const payload = await fetchMetricSet(mediaId, token, metricSet);
      return {
        mediaId,
        metrics: mapInstagramInsights(payload.data),
        requestedMetrics: metricSet,
        errors,
      };
    } catch (err) {
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : undefined;
      errors.push({
        metrics: metricSet,
        status,
        message: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      });
      if (status && ![400, 403].includes(status)) break;
    }
  }
  return { mediaId, metrics: {}, requestedMetrics: null, errors };
}
