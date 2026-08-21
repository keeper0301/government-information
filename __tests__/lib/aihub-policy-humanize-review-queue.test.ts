import { describe, expect, it } from "vitest";

import { buildPolicyHumanizeReviewQueue } from "@/lib/aihub-policy-humanize-review-queue";

describe("AIHub policy humanize/review queue", () => {
  it("builds a read-only humanize/review queue from draft cards", async () => {
    const queue = await buildPolicyHumanizeReviewQueue({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(queue.status).toBe("read_only_humanize_review_queue");
    expect(queue.count).toBe(2);
    expect(queue.countsByStatus.humanize_required).toBe(2);
    expect(queue.countsByStatus.review_required).toBe(0);
    expect(queue.allowedStatuses).toEqual(["humanize_required", "review_required"]);
    expect(queue.items.every((item) => item.humanizeBrief.requiredDisclosure === "official_source_readback_required_before_publish")).toBe(true);
    expect(queue.items.every((item) => item.reviewChecklist.some((entry) => entry.includes("운영자 최종 승인")))).toBe(true);
    expect(queue.items.every((item) => item.publishGate.approvedToPublish === false)).toBe(true);
    expect(queue.safety.queueMeans).toBe("humanize_and_operator_review_queue_not_publish_approval");
  });

  it("keeps the humanize/review queue empty when no draft cards exist", async () => {
    const queue = await buildPolicyHumanizeReviewQueue({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(queue.count).toBe(0);
    expect(queue.sourceDraftCards.count).toBe(0);
    expect(queue.items).toEqual([]);
    expect(queue.safety.publish).toBe(false);
  });
});
