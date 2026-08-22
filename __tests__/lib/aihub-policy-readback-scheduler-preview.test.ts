import { describe, expect, it } from "vitest";

import { buildPolicyReadbackSchedulerPreview } from "@/lib/aihub-policy-readback-scheduler-preview";

describe("AIHub policy readback scheduler preview", () => {
  it("builds read-only immediate/24h/72h schedule cards from W12 live readback preview", async () => {
    const preview = await buildPolicyReadbackSchedulerPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
      baseUrl: "https://example.test",
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(preview.status).toBe("read_only_readback_scheduler_preview");
    expect(preview.sourceStatus).toBe("live_readback_preview_waiting_for_published_url");
    expect(preview.scheduleSlots).toEqual(["immediate", "after_24h", "after_72h"]);
    expect(preview.count).toBe(6);
    expect(preview.safety.cronCreate).toBe(false);
    expect(preview.safety.externalFetch).toBe(false);
    expect(preview.safety.schedulerPreviewMeans).toBe("schedule_cards_only_not_cron_or_external_readback");

    const first = preview.cards[0];
    expect(first.status).toBe("readback_schedule_preview_pending_live_publish");
    expect(first.slot).toBe("immediate");
    expect(first.scheduledForPreview).toBe("2026-01-01T00:00:00.000Z");
    expect(first.expectedPublishedUrlPreview).toMatch(/^https:\/\/example\.test\/policy\//);
    expect(first.approvalRequiredBeforeRun).toBe(true);
    expect(first.canCreateCron).toBe(false);
    expect(first.canRunExternalReadback).toBe(false);
    expect(first.blockers).toContain("cron 생성은 별도 운영 승인 필요");

    const after24h = preview.cards.find((card) => card.slot === "after_24h");
    expect(after24h?.scheduledForPreview).toBe("2026-01-02T00:00:00.000Z");
    expect(after24h?.targetChecks).toContain("GSC page/query readback preview");

    const after72h = preview.cards.find((card) => card.slot === "after_72h");
    expect(after72h?.scheduledForPreview).toBe("2026-01-04T00:00:00.000Z");
    expect(after72h?.targetChecks).toContain("GSC impression/click/CTR/position 72h 재확인");
  });

  it("keeps scheduler preview empty when the W12 source queue is empty", async () => {
    const preview = await buildPolicyReadbackSchedulerPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(preview.count).toBe(0);
    expect(preview.cards).toEqual([]);
    expect(preview.sourceLiveReadbackPreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
