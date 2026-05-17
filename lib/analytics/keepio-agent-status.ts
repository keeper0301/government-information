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
      automation?: Partial<Record<keyof KeepioAgentAutomationStatus, unknown>>;
    };

    return {
      configured: true,
      ok: res.ok && body.ok === true,
      ready: res.ok && body.ready === true,
      healthUrl,
      checkedAt: typeof body.checkedAt === "string" ? body.checkedAt : null,
      uptimeSec: typeof body.uptimeSec === "number" ? body.uptimeSec : null,
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
      missingRequired: [],
      automation: EMPTY_AUTOMATION,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
