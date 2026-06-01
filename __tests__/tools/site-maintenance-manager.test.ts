import { describe, expect, it, vi } from "vitest";

describe("site-maintenance-manager", () => {
  it("사이트 개선·버그 감지 cron 3종을 호출한다", async () => {
    const { runSiteMaintenanceManager } = await import(
      "../../tools/site-maintenance-manager.mjs"
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "{\"ok\":true}",
    }));

    const result = await runSiteMaintenanceManager({
      config: {
        enabled: true,
        intervalMs: 3600000,
      },
      siteBaseUrl: "https://www.keepioo.com",
      cronSecret: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/autonomous-improvement-scan",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/failed-cron-retry",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/silent-fail-detect",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
