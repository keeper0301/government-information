export type KeepioAgentAutomationStatus = {
  telegram: boolean;
  policyDb: boolean;
  contentGeneration: boolean;
  threadsPublishing: boolean;
  instagramMetrics: boolean;
  instagramComments: boolean;
};

export type KeepioAgentStatus = {
  configured: boolean;
  ok: boolean;
  ready: boolean;
  healthUrl: string | null;
  checkedAt: string | null;
  uptimeSec: number | null;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastFailureAt: string | null;
  lastStatus: number | null;
  totalRuns: number;
  totalFailures: number;
  consecutiveFailures: number;
  missingRequired: string[];
  automation: KeepioAgentAutomationStatus;
  error: string | null;
};

const EMPTY_AUTOMATION: KeepioAgentAutomationStatus = {
  telegram: false,
  policyDb: false,
  contentGeneration: false,
  threadsPublishing: false,
  instagramMetrics: false,
  instagramComments: false,
};

export async function getKeepioAgentStatus(): Promise<KeepioAgentStatus> {
  const healthUrl = process.env.KEEPIO_AGENT_HEALTH_URL ?? null;
  if (!healthUrl) {
    return {
      configured: false,
      ok: false,
      ready: false,
      healthUrl: null,
      checkedAt: null,
      uptimeSec: null,
      lastRunAt: null,
      lastOkAt: null,
      lastFailureAt: null,
      lastStatus: null,
      totalRuns: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      missingRequired: ["KEEPIO_AGENT_HEALTH_URL"],
      automation: EMPTY_AUTOMATION,
      error: "KEEPIO_AGENT_HEALTH_URL 미설정",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(healthUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await res.json()) as {
      ok?: unknown;
      ready?: unknown;
      checkedAt?: unknown;
      uptimeSec?: unknown;
      env?: { missingRequired?: unknown };
      resident?: {
        lastRunAt?: unknown;
        lastOkAt?: unknown;
        lastFailureAt?: unknown;
        lastStatus?: unknown;
        totalRuns?: unknown;
        totalFailures?: unknown;
        consecutiveFailures?: unknown;
      };
      automation?: Partial<Record<keyof KeepioAgentAutomationStatus, unknown>>;
    };

    return {
      configured: true,
      ok: res.ok && body.ok === true,
      ready: res.ok && body.ready === true,
      healthUrl,
      checkedAt: typeof body.checkedAt === "string" ? body.checkedAt : null,
      uptimeSec: typeof body.uptimeSec === "number" ? body.uptimeSec : null,
      lastRunAt:
        typeof body.resident?.lastRunAt === "string" ? body.resident.lastRunAt : null,
      lastOkAt:
        typeof body.resident?.lastOkAt === "string" ? body.resident.lastOkAt : null,
      lastFailureAt:
        typeof body.resident?.lastFailureAt === "string"
          ? body.resident.lastFailureAt
          : null,
      lastStatus:
        typeof body.resident?.lastStatus === "number" ? body.resident.lastStatus : null,
      totalRuns:
        typeof body.resident?.totalRuns === "number" ? body.resident.totalRuns : 0,
      totalFailures:
        typeof body.resident?.totalFailures === "number"
          ? body.resident.totalFailures
          : 0,
      consecutiveFailures:
        typeof body.resident?.consecutiveFailures === "number"
          ? body.resident.consecutiveFailures
          : 0,
      missingRequired: Array.isArray(body.env?.missingRequired)
        ? body.env.missingRequired.filter((v): v is string => typeof v === "string")
        : [],
      automation: {
        telegram: body.automation?.telegram === true,
        policyDb: body.automation?.policyDb === true,
        contentGeneration: body.automation?.contentGeneration === true,
        threadsPublishing: body.automation?.threadsPublishing === true,
        instagramMetrics: body.automation?.instagramMetrics === true,
        instagramComments: body.automation?.instagramComments === true,
      },
      error: res.ok ? null : `health ${res.status}`,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      ready: false,
      healthUrl,
      checkedAt: null,
      uptimeSec: null,
      lastRunAt: null,
      lastOkAt: null,
      lastFailureAt: null,
      lastStatus: null,
      totalRuns: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      missingRequired: [],
      automation: EMPTY_AUTOMATION,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
