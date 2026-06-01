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
  siteLastCheckAt: string | null;
  siteLastOkAt: string | null;
  siteLastFailureAt: string | null;
  siteTotalChecks: number;
  siteTotalFailures: number;
  siteConsecutiveFailures: number;
  siteTelegramConfigured: boolean;
  aiManagerEnabled: boolean;
  aiManagerConfigured: boolean;
  aiManagerPermissionLevel: string | null;
  aiManagerLastRunAt: string | null;
  aiManagerLastOkAt: string | null;
  aiManagerTotalRuns: number;
  aiManagerTotalFailures: number;
  blogManagerEnabled: boolean;
  blogManagerLastRunAt: string | null;
  blogManagerTotalRuns: number;
  blogManagerTotalFailures: number;
  siteMaintenanceEnabled: boolean;
  siteMaintenanceLastRunAt: string | null;
  siteMaintenanceTotalRuns: number;
  siteMaintenanceTotalFailures: number;
  siteUpgradeEnabled: boolean;
  siteUpgradeLastRunAt: string | null;
  siteUpgradeTotalRuns: number;
  siteUpgradeTotalFailures: number;
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
      siteLastCheckAt: null,
      siteLastOkAt: null,
      siteLastFailureAt: null,
      siteTotalChecks: 0,
      siteTotalFailures: 0,
      siteConsecutiveFailures: 0,
      siteTelegramConfigured: false,
      aiManagerEnabled: false,
      aiManagerConfigured: false,
      aiManagerPermissionLevel: null,
      aiManagerLastRunAt: null,
      aiManagerLastOkAt: null,
      aiManagerTotalRuns: 0,
      aiManagerTotalFailures: 0,
      blogManagerEnabled: false,
      blogManagerLastRunAt: null,
      blogManagerTotalRuns: 0,
      blogManagerTotalFailures: 0,
      siteMaintenanceEnabled: false,
      siteMaintenanceLastRunAt: null,
      siteMaintenanceTotalRuns: 0,
      siteMaintenanceTotalFailures: 0,
      siteUpgradeEnabled: false,
      siteUpgradeLastRunAt: null,
      siteUpgradeTotalRuns: 0,
      siteUpgradeTotalFailures: 0,
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
      site?: {
        lastCheckAt?: unknown;
        lastOkAt?: unknown;
        lastFailureAt?: unknown;
        totalChecks?: unknown;
        totalFailures?: unknown;
        consecutiveFailures?: unknown;
        telegramConfigured?: unknown;
      };
      automation?: Partial<Record<keyof KeepioAgentAutomationStatus, unknown>>;
      aiManager?: {
        enabled?: unknown;
        configured?: unknown;
        permissionLevel?: unknown;
        lastRunAt?: unknown;
        lastOkAt?: unknown;
        totalRuns?: unknown;
        totalFailures?: unknown;
      };
      blogManager?: {
        enabled?: unknown;
        lastRunAt?: unknown;
        totalRuns?: unknown;
        totalFailures?: unknown;
      };
      siteMaintenance?: {
        enabled?: unknown;
        lastRunAt?: unknown;
        totalRuns?: unknown;
        totalFailures?: unknown;
      };
      siteUpgrade?: {
        enabled?: unknown;
        lastRunAt?: unknown;
        totalRuns?: unknown;
        totalFailures?: unknown;
      };
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
      siteLastCheckAt:
        typeof body.site?.lastCheckAt === "string" ? body.site.lastCheckAt : null,
      siteLastOkAt:
        typeof body.site?.lastOkAt === "string" ? body.site.lastOkAt : null,
      siteLastFailureAt:
        typeof body.site?.lastFailureAt === "string"
          ? body.site.lastFailureAt
          : null,
      siteTotalChecks:
        typeof body.site?.totalChecks === "number" ? body.site.totalChecks : 0,
      siteTotalFailures:
        typeof body.site?.totalFailures === "number" ? body.site.totalFailures : 0,
      siteConsecutiveFailures:
        typeof body.site?.consecutiveFailures === "number"
          ? body.site.consecutiveFailures
          : 0,
      siteTelegramConfigured: body.site?.telegramConfigured === true,
      aiManagerEnabled: body.aiManager?.enabled === true,
      aiManagerConfigured: body.aiManager?.configured === true,
      aiManagerPermissionLevel:
        typeof body.aiManager?.permissionLevel === "string"
          ? body.aiManager.permissionLevel
          : null,
      aiManagerLastRunAt:
        typeof body.aiManager?.lastRunAt === "string"
          ? body.aiManager.lastRunAt
          : null,
      aiManagerLastOkAt:
        typeof body.aiManager?.lastOkAt === "string"
          ? body.aiManager.lastOkAt
          : null,
      aiManagerTotalRuns:
        typeof body.aiManager?.totalRuns === "number"
          ? body.aiManager.totalRuns
          : 0,
      aiManagerTotalFailures:
        typeof body.aiManager?.totalFailures === "number"
          ? body.aiManager.totalFailures
          : 0,
      blogManagerEnabled: body.blogManager?.enabled === true,
      blogManagerLastRunAt:
        typeof body.blogManager?.lastRunAt === "string"
          ? body.blogManager.lastRunAt
          : null,
      blogManagerTotalRuns:
        typeof body.blogManager?.totalRuns === "number"
          ? body.blogManager.totalRuns
          : 0,
      blogManagerTotalFailures:
        typeof body.blogManager?.totalFailures === "number"
          ? body.blogManager.totalFailures
          : 0,
      siteMaintenanceEnabled: body.siteMaintenance?.enabled === true,
      siteMaintenanceLastRunAt:
        typeof body.siteMaintenance?.lastRunAt === "string"
          ? body.siteMaintenance.lastRunAt
          : null,
      siteMaintenanceTotalRuns:
        typeof body.siteMaintenance?.totalRuns === "number"
          ? body.siteMaintenance.totalRuns
          : 0,
      siteMaintenanceTotalFailures:
        typeof body.siteMaintenance?.totalFailures === "number"
          ? body.siteMaintenance.totalFailures
          : 0,
      siteUpgradeEnabled: body.siteUpgrade?.enabled === true,
      siteUpgradeLastRunAt:
        typeof body.siteUpgrade?.lastRunAt === "string"
          ? body.siteUpgrade.lastRunAt
          : null,
      siteUpgradeTotalRuns:
        typeof body.siteUpgrade?.totalRuns === "number"
          ? body.siteUpgrade.totalRuns
          : 0,
      siteUpgradeTotalFailures:
        typeof body.siteUpgrade?.totalFailures === "number"
          ? body.siteUpgrade.totalFailures
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
      error: res.ok ? null : `상태 확인 실패: HTTP ${res.status}`,
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
      siteLastCheckAt: null,
      siteLastOkAt: null,
      siteLastFailureAt: null,
      siteTotalChecks: 0,
      siteTotalFailures: 0,
      siteConsecutiveFailures: 0,
      siteTelegramConfigured: false,
      aiManagerEnabled: false,
      aiManagerConfigured: false,
      aiManagerPermissionLevel: null,
      aiManagerLastRunAt: null,
      aiManagerLastOkAt: null,
      aiManagerTotalRuns: 0,
      aiManagerTotalFailures: 0,
      blogManagerEnabled: false,
      blogManagerLastRunAt: null,
      blogManagerTotalRuns: 0,
      blogManagerTotalFailures: 0,
      siteMaintenanceEnabled: false,
      siteMaintenanceLastRunAt: null,
      siteMaintenanceTotalRuns: 0,
      siteMaintenanceTotalFailures: 0,
      siteUpgradeEnabled: false,
      siteUpgradeLastRunAt: null,
      siteUpgradeTotalRuns: 0,
      siteUpgradeTotalFailures: 0,
      missingRequired: [],
      automation: EMPTY_AUTOMATION,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
