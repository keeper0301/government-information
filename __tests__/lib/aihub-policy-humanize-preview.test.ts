import { describe, expect, it } from "vitest";

import { buildPolicyHumanizePreview } from "@/lib/aihub-policy-humanize-preview";

describe("AIHub policy humanize preview", () => {
  it("builds read-only humanized preview text from humanize/review queue items", async () => {
    const preview = await buildPolicyHumanizePreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.status).toBe("read_only_humanized_preview");
    expect(preview.count).toBe(2);
    expect(preview.countsByStatus.humanized_preview_ready).toBe(2);
    expect(preview.countsByStatus.review_required).toBe(0);
    expect(preview.items.every((item) => item.status === "humanized_preview_ready")).toBe(true);
    expect(preview.items.every((item) => item.humanizedPreviewText.includes("확인해야"))).toBe(true);
    expect(preview.items.every((item) => item.qualityGate.factsPreserved)).toBe(true);
    expect(preview.items.every((item) => item.publishGate.approvedToPublish === false)).toBe(true);
    expect(preview.safety.humanizePreviewMeans).toBe("style_preview_and_review_required_not_publish_approval");
  });

  it("keeps preview empty when no humanize queue items exist", async () => {
    const preview = await buildPolicyHumanizePreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.sourceQueue.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.safety.publish).toBe(false);
  });
});
