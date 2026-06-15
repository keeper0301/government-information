import { afterEach, describe, expect, it, vi } from "vitest";
import { getKeepioAgentStatus } from "@/lib/analytics/keepio-agent-status";

const originalHealthUrl = process.env.KEEPIO_AGENT_HEALTH_URL;

describe("getKeepioAgentStatus", () => {
  afterEach(() => {
    if (originalHealthUrl === undefined) {
      delete process.env.KEEPIO_AGENT_HEALTH_URL;
    } else {
      process.env.KEEPIO_AGENT_HEALTH_URL = originalHealthUrl;
    }
    vi.unstubAllGlobals();
  });

  it("health URL이 없으면 Hermes sidecar 활성 상태로 폴백한다", async () => {
    delete process.env.KEEPIO_AGENT_HEALTH_URL;

    const status = await getKeepioAgentStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.missingRequired).toEqual([]);
    expect(status.error).toBeNull();
    expect(status.source).toBe("hermes_sidecar");
    expect(status.telemetryConfigured).toBe(false);
    expect(status.automationDetails).toHaveLength(7);
    expect(status.readinessSummary).toMatchObject({
      total: 7,
      ready: 6,
      needsAttention: 1,
      readinessPercent: 86,
      healthLabel: "부분 확인 필요",
      healthTone: "amber",
      blockedPublicActions: 1,
      priorityActionLabel: "W1 수정 PR 생성 확인 필요",
    });
    expect(status.automationDetails.find((item) => item.key === "threadsPublishing")).toMatchObject({
      risk: "approval_required",
      riskLabel: "공개 전 승인 필요",
      statusLabel: "준비됨",
    });
    expect(status.automationDetails.find((item) => item.key === "instagramComments")?.nextCheck).toContain("초안");
    expect(status.actionItems.join(" ")).toContain("승인 + safety gate + dry-run ready");
    expect(status.automation.telegram).toBe(true);
    expect(status.automation.prCreation).toBe(false);
    expect(status.automation.instagramComments).toBe(true);
    expect(status.aiManagerEnabled).toBe(true);
    expect(status.aiManagerConfigured).toBe(true);
    expect(status.blogManagerEnabled).toBe(true);
    expect(status.siteMaintenanceEnabled).toBe(true);
    expect(status.siteUpgradeEnabled).toBe(true);
  });

  it("워커 health 응답을 자율 운영 카드 상태로 변환한다", async () => {
    process.env.KEEPIO_AGENT_HEALTH_URL = "http://127.0.0.1:8787/health";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          ready: true,
          checkedAt: "2026-05-21T00:00:00.000Z",
          uptimeSec: 123,
          env: { missingRequired: [] },
          resident: {
            lastRunAt: "2026-05-21T00:01:00.000Z",
            lastOkAt: "2026-05-21T00:01:03.000Z",
            lastFailureAt: "2026-05-20T23:59:00.000Z",
            lastStatus: 200,
            totalRuns: 12,
            totalFailures: 1,
            consecutiveFailures: 0,
          },
          site: {
            lastCheckAt: "2026-05-21T00:02:00.000Z",
            lastOkAt: "2026-05-21T00:02:00.000Z",
            lastFailureAt: "2026-05-20T23:50:00.000Z",
            totalChecks: 20,
            totalFailures: 2,
            consecutiveFailures: 0,
            telegramConfigured: true,
          },
          automation: {
            telegram: true,
            policyDb: true,
            contentGeneration: true,
            prCreation: false,
            threadsPublishing: false,
            instagramMetrics: true,
            instagramComments: false,
          },
          aiManager: {
            enabled: true,
            configured: true,
            permissionLevel: "full_safe",
            lastRunAt: "2026-05-21T00:03:00.000Z",
            lastOkAt: "2026-05-21T00:03:05.000Z",
            totalRuns: 3,
            totalFailures: 0,
          },
          blogManager: {
            enabled: true,
            lastRunAt: "2026-05-21T00:04:00.000Z",
            totalRuns: 4,
            totalFailures: 1,
          },
          siteMaintenance: {
            enabled: true,
            lastRunAt: "2026-05-21T00:05:00.000Z",
            totalRuns: 5,
            totalFailures: 0,
          },
          siteUpgrade: {
            enabled: true,
            lastRunAt: "2026-05-21T00:06:00.000Z",
            totalRuns: 6,
            totalFailures: 0,
          },
        }),
      })),
    );

    const status = await getKeepioAgentStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.source).toBe("health_url");
    expect(status.telemetryConfigured).toBe(true);
    expect(status.uptimeSec).toBe(123);
    expect(status.lastFailureAt).toBe("2026-05-20T23:59:00.000Z");
    expect(status.lastStatus).toBe(200);
    expect(status.totalRuns).toBe(12);
    expect(status.totalFailures).toBe(1);
    expect(status.siteLastCheckAt).toBe("2026-05-21T00:02:00.000Z");
    expect(status.siteTotalChecks).toBe(20);
    expect(status.siteTotalFailures).toBe(2);
    expect(status.siteTelegramConfigured).toBe(true);
    expect(status.aiManagerEnabled).toBe(true);
    expect(status.aiManagerConfigured).toBe(true);
    expect(status.aiManagerPermissionLevel).toBe("full_safe");
    expect(status.aiManagerTotalRuns).toBe(3);
    expect(status.blogManagerEnabled).toBe(true);
    expect(status.blogManagerTotalRuns).toBe(4);
    expect(status.siteMaintenanceEnabled).toBe(true);
    expect(status.siteMaintenanceTotalRuns).toBe(5);
    expect(status.siteUpgradeEnabled).toBe(true);
    expect(status.siteUpgradeTotalRuns).toBe(6);
    expect(status.automation.policyDb).toBe(true);
    expect(status.automation.prCreation).toBe(false);
    expect(status.automation.threadsPublishing).toBe(false);
    expect(status.readinessSummary).toMatchObject({
      total: 7,
      ready: 4,
      needsAttention: 3,
      readinessPercent: 57,
      healthLabel: "운영 점검 필요",
      healthTone: "red",
      blockedPublicActions: 2,
      priorityActionLabel: "W1 수정 PR 생성 확인 필요",
      priorityActionDetail: "AGENT_W1_ENABLED와 GitHub PR 생성 토큰이 실제 워커에 설정됐는지 확인",
    });
    expect(status.actionItems.join(" ")).toContain("W1 수정 PR 생성 확인 필요");
    expect(status.actionItems.join(" ")).toContain("Threads 자동 발행 확인 필요");
    expect(status.actionItems.join(" ")).toContain("Instagram 댓글 답글 확인 필요");
    expect(status.automationDetails.find((item) => item.key === "threadsPublishing")).toMatchObject({
      ready: false,
      statusLabel: "확인 필요",
      risk: "approval_required",
    });
  });

  it("health 호출이 실패하면 에러 상태를 반환한다", async () => {
    process.env.KEEPIO_AGENT_HEALTH_URL = "http://127.0.0.1:8787/health";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("연결 실패");
      }),
    );

    const status = await getKeepioAgentStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.error).toBe("연결 실패");
  });

  it("health 응답 코드 실패를 한국어 오류로 반환한다", async () => {
    process.env.KEEPIO_AGENT_HEALTH_URL = "http://127.0.0.1:8787/health";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          ready: false,
          checkedAt: "2026-05-21T00:00:00.000Z",
          uptimeSec: 10,
          env: { missingRequired: [] },
          automation: {},
        }),
      })),
    );

    const status = await getKeepioAgentStatus();

    expect(status.ok).toBe(false);
    expect(status.error).toBe("상태 확인 실패: HTTP 503");
  });
});
