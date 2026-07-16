import { describe, expect, it } from "vitest";
import { summarizeInstagramLegacyPublishStatus } from "@/lib/agent/diagnose";

const NOW = new Date("2026-07-16T12:00:00.000Z");

describe("summarizeInstagramLegacyPublishStatus", () => {
  it("legacy 3-card pipeline renderer를 고정해서 healthy 상태를 만든다", () => {
    const status = summarizeInstagramLegacyPublishStatus({
      tokenConfigured: true,
      published24h: 1,
      latestPublishedAt: "2026-07-16T06:00:00.000Z",
      now: NOW,
    });

    expect(status.status).toBe("healthy");
    expect(status.legacyRenderer).toBe("next-og-image-response-3-card");
    expect(status.hoursSinceLastPublish).toBe(6);
  });

  it("OAuth token 이 없으면 not_configured 로 분류한다", () => {
    const status = summarizeInstagramLegacyPublishStatus({
      tokenConfigured: false,
      pendingCount: 3,
      now: NOW,
    });

    expect(status.status).toBe("not_configured");
    expect(status.pendingCount).toBe(3);
  });

  it("대기 글이 있는데 26시간 넘게 발행이 없으면 조치 필요로 본다", () => {
    const status = summarizeInstagramLegacyPublishStatus({
      tokenConfigured: true,
      pendingCount: 2,
      latestPublishedAt: "2026-07-15T08:00:00.000Z",
      now: NOW,
    });

    expect(status.status).toBe("needs_attention");
    expect(status.hoursSinceLastPublish).toBe(28);
  });

  it("품질 차단·실패 시도·3회 소진은 조치 필요로 본다", () => {
    for (const partial of [
      { blockedByQualityCount: 1 },
      { failedAttemptCount: 1 },
      { exhaustedAttemptCount: 1 },
    ]) {
      expect(
        summarizeInstagramLegacyPublishStatus({
          tokenConfigured: true,
          latestPublishedAt: "2026-07-16T06:00:00.000Z",
          now: NOW,
          ...partial,
        }).status,
      ).toBe("needs_attention");
    }
  });
});
