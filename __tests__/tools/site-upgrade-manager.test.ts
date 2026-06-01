import { describe, expect, it, vi } from "vitest";

describe("site-upgrade-manager", () => {
  it("사이트 품질 업그레이드 cron 4종을 호출한다", async () => {
    const { runSiteUpgradeManager } = await import(
      "../../tools/site-upgrade-manager.mjs"
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "{\"ok\":true}",
    }));

    const result = await runSiteUpgradeManager({
      config: {
        enabled: true,
        intervalMs: 21600000,
      },
      siteBaseUrl: "https://www.keepioo.com",
      cronSecret: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/indexnow-submit-recent",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/policy-url-check",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/policy-ai-guide-backfill",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/news-ai-commentary-backfill",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
