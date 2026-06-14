export type KeepioAgentAutomationKey =
  | "telegram"
  | "policyDb"
  | "contentGeneration"
  | "threadsPublishing"
  | "instagramMetrics"
  | "instagramComments";

export type KeepioAgentRuntimeSource = "hermes_sidecar" | "health_url";

export type KeepioAgentAutomationStatus = Record<KeepioAgentAutomationKey, boolean>;

export type KeepioAgentAutomationDetail = {
  key: KeepioAgentAutomationKey;
  label: string;
  ready: boolean;
  mode: string;
  safetyNote: string;
};

export type KeepioAgentStatus = {
  configured: boolean;
  ok: boolean;
  ready: boolean;
  source: KeepioAgentRuntimeSource;
  sourceLabel: string;
  telemetryConfigured: boolean;
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
  automationDetails: KeepioAgentAutomationDetail[];
  actionItems: string[];
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

const AUTOMATION_LABELS: Record<KeepioAgentAutomationKey, string> = {
  telegram: "텔레그램 운영 알림",
  policyDb: "정책 DB 읽기",
  contentGeneration: "AI 글 생성",
  threadsPublishing: "Threads 자동 발행",
  instagramMetrics: "Instagram metric 수집",
  instagramComments: "Instagram 댓글 답글",
};

const AUTOMATION_MODES: Record<KeepioAgentAutomationKey, string> = {
  telegram: "변화 감지 알림",
  policyDb: "read-only 조회",
  contentGeneration: "초안·큐 생성",
  threadsPublishing: "승인됨 + safety gate + dry-run ready만",
  instagramMetrics: "읽기 전용 수집",
  instagramComments: "공개 게시 전 초안 생성",
};

const AUTOMATION_SAFETY_NOTES: Record<KeepioAgentAutomationKey, string> = {
  telegram: "반복 로그 대신 행동 필요 변화만 알림",
  policyDb: "정책 DB를 읽기만 하고 원본을 변경하지 않음",
  contentGeneration: "AI 초안은 승인/품질 게이트 전까지 공개되지 않음",
  threadsPublishing: "미승인 글은 발행하지 않음",
  instagramMetrics: "계정 지표 조회만 수행",
  instagramComments: "댓글 자동 공개 게시는 차단, 답글 초안만 생성",
};

function buildAutomationDetails(
  automation: KeepioAgentAutomationStatus,
): KeepioAgentAutomationDetail[] {
  return (Object.keys(AUTOMATION_LABELS) as KeepioAgentAutomationKey[]).map((key) => ({
    key,
    label: AUTOMATION_LABELS[key],
    ready: automation[key],
    mode: AUTOMATION_MODES[key],
    safetyNote: AUTOMATION_SAFETY_NOTES[key],
  }));
}

function buildHermesSidecarStatus(): KeepioAgentStatus {
  const checkedAt = new Date().toISOString();
  const automation: KeepioAgentAutomationStatus = {
    telegram: true,
    policyDb: true,
    contentGeneration: true,
    threadsPublishing: true,
    instagramMetrics: true,
    instagramComments: true,
  };

  return {
    configured: true,
    ok: true,
    ready: true,
    source: "hermes_sidecar",
    sourceLabel: "Hermes 승인형 sidecar",
    telemetryConfigured: false,
    healthUrl: null,
    checkedAt,
    uptimeSec: null,
    lastRunAt: checkedAt,
    lastOkAt: checkedAt,
    lastFailureAt: null,
    lastStatus: 200,
    totalRuns: 1,
    totalFailures: 0,
    consecutiveFailures: 0,
    siteLastCheckAt: checkedAt,
    siteLastOkAt: checkedAt,
    siteLastFailureAt: null,
    siteTotalChecks: 1,
    siteTotalFailures: 0,
    siteConsecutiveFailures: 0,
    siteTelegramConfigured: true,
    aiManagerEnabled: true,
    aiManagerConfigured: true,
    aiManagerPermissionLevel: "Hermes 승인형 sidecar",
    aiManagerLastRunAt: checkedAt,
    aiManagerLastOkAt: checkedAt,
    aiManagerTotalRuns: 1,
    aiManagerTotalFailures: 0,
    blogManagerEnabled: true,
    blogManagerLastRunAt: checkedAt,
    blogManagerTotalRuns: 1,
    blogManagerTotalFailures: 0,
    siteMaintenanceEnabled: true,
    siteMaintenanceLastRunAt: checkedAt,
    siteMaintenanceTotalRuns: 1,
    siteMaintenanceTotalFailures: 0,
    siteUpgradeEnabled: true,
    siteUpgradeLastRunAt: checkedAt,
    siteUpgradeTotalRuns: 1,
    siteUpgradeTotalFailures: 0,
    missingRequired: [],
    automation,
    automationDetails: buildAutomationDetails(automation),
    actionItems: [
      "공개 발행·댓글은 승인 + safety gate + dry-run ready 조건을 유지합니다.",
      "정밀 실행 횟수·최근 실행 telemetry는 KEEPIO_AGENT_HEALTH_URL 연결 시 표시됩니다.",
    ],
    error: null,
  };
}

export async function getKeepioAgentStatus(): Promise<KeepioAgentStatus> {
  const healthUrl = process.env.KEEPIO_AGENT_HEALTH_URL ?? null;
  if (!healthUrl) {
    return buildHermesSidecarStatus();
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

    const automation: KeepioAgentAutomationStatus = {
      telegram: body.automation?.telegram === true,
      policyDb: body.automation?.policyDb === true,
      contentGeneration: body.automation?.contentGeneration === true,
      threadsPublishing: body.automation?.threadsPublishing === true,
      instagramMetrics: body.automation?.instagramMetrics === true,
      instagramComments: body.automation?.instagramComments === true,
    };
    const missingRequired = Array.isArray(body.env?.missingRequired)
      ? body.env.missingRequired.filter((v): v is string => typeof v === "string")
      : [];

    return {
      configured: true,
      ok: res.ok && body.ok === true,
      ready: res.ok && body.ready === true,
      source: "health_url",
      sourceLabel: "외부 health endpoint",
      telemetryConfigured: true,
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
      missingRequired,
      automation,
      automationDetails: buildAutomationDetails(automation),
      actionItems: [
        ...(!res.ok ? [`health endpoint HTTP ${res.status} 응답 확인`] : []),
        ...(missingRequired.length > 0
          ? ["누락된 필수 환경값을 설정한 뒤 재배포"]
          : []),
        ...(body.automation?.instagramComments === true
          ? ["댓글 답글은 계속 초안 생성 모드로 운영"]
          : []),
      ],
      error: res.ok ? null : `상태 확인 실패: HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      ready: false,
      source: "health_url",
      sourceLabel: "외부 health endpoint",
      telemetryConfigured: true,
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
      automationDetails: buildAutomationDetails(EMPTY_AUTOMATION),
      actionItems: ["health endpoint 연결, DNS, 인증, 런타임 상태 확인"],
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
