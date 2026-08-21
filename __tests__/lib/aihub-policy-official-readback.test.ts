import { describe, expect, it } from "vitest";

import { buildPolicyDraftQueueItems } from "@/lib/aihub-policy-draft-queue";
import { buildPolicyOfficialReadbackPreview } from "@/lib/aihub-policy-official-readback";

describe("AIHub policy official readback preview", () => {
  it("promotes only items with successful official source readback to ready_for_draft", async () => {
    const items = buildPolicyDraftQueueItems().slice(0, 2);
    const fetcher = async (url: string) =>
      new Response("ok", {
        status: url.includes("gov.kr") ? 200 : 500,
        headers: { "content-type": "text/html" },
      });

    const preview = await buildPolicyOfficialReadbackPreview(items, { fetcher, itemLimit: 2, sourceLimit: 1 });

    expect(preview.status).toBe("read_only_official_readback_preview");
    expect(preview.count).toBe(2);
    expect(preview.countsByStatus.ready_for_draft).toBeGreaterThan(0);
    expect(preview.countsByStatus.needs_fact_readback + preview.countsByStatus.ready_for_draft).toBe(2);
    expect(preview.items.filter((item) => item.status === "ready_for_draft").every((item) => item.successfulReadbackCount > 0)).toBe(true);
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.readyForDraftMeans).toBe("official_search_source_reachable_preview_not_publish_approval");
  });

  it("keeps failed official readback items blocked", async () => {
    const preview = await buildPolicyOfficialReadbackPreview(buildPolicyDraftQueueItems().slice(0, 2), {
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 2,
    });

    expect(preview.countsByStatus.ready_for_draft).toBe(0);
    expect(preview.countsByStatus.needs_fact_readback).toBe(2);
    expect(preview.items.every((item) => item.promotionBlockedReason.includes("성공 전"))).toBe(true);
  });
});
