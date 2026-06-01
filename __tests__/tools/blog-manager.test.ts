import { describe, expect, it, vi } from "vitest";

describe("blog-manager", () => {
  it("블로그 발행 정지 추천이 있으면 백업 발행이 필요하다고 판단한다", async () => {
    const { needsBackupPublish } = await import("../../tools/blog-manager.mjs");

    expect(
      needsBackupPublish({
        recommendations: [
          { operation: { action: "codex_blog_publish_fix" } },
        ],
      }),
    ).toBe(true);
  });

  it("품질 검수와 SNS 발행을 호출하고, 필요하면 백업 발행도 호출한다", async () => {
    const { runBlogManager } = await import("../../tools/blog-manager.mjs");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "{\"ok\":true}",
    }));

    const result = await runBlogManager({
      config: {
        enabled: true,
        allowBackupPublish: true,
        intervalMs: 3600000,
        backupPublishGapMs: 43200000,
      },
      siteBaseUrl: "https://www.keepioo.com",
      cronSecret: "secret",
      lastBackupPublishAt: null,
      cycle: {
        recommendations: [
          { operation: { action: "codex_blog_publish_fix" } },
        ],
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.backupAttempted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/cron/blog-quality-check",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/publish-blog?count=1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
