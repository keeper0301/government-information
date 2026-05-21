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

  it("health URL이 없으면 미설정 상태를 반환한다", async () => {
    delete process.env.KEEPIO_AGENT_HEALTH_URL;

    const status = await getKeepioAgentStatus();

    expect(status.configured).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.missingRequired).toEqual(["KEEPIO_AGENT_HEALTH_URL"]);
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
          automation: {
            telegram: true,
            policyDb: true,
            contentGeneration: true,
            threadsPublishing: false,
            instagramMetrics: true,
            instagramComments: false,
          },
        }),
      })),
    );

    const status = await getKeepioAgentStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.uptimeSec).toBe(123);
    expect(status.lastFailureAt).toBe("2026-05-20T23:59:00.000Z");
    expect(status.lastStatus).toBe(200);
    expect(status.totalRuns).toBe(12);
    expect(status.totalFailures).toBe(1);
    expect(status.automation.policyDb).toBe(true);
    expect(status.automation.threadsPublishing).toBe(false);
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
