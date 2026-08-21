import { describe, expect, it } from "vitest";

import { buildPolicyOperatorReviewPreview } from "@/lib/aihub-policy-operator-review";

describe("AIHub policy operator review preview", () => {
  it("separates humanized previews into review pass/hold/revision preview statuses", async () => {
    const review = await buildPolicyOperatorReviewPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(review.status).toBe("read_only_operator_review_preview");
    expect(review.count).toBe(2);
    expect(review.allowedStatuses).toEqual(["review_passed_preview", "review_hold", "revision_required"]);
    expect(review.countsByStatus.review_passed_preview).toBe(2);
    expect(review.countsByStatus.review_hold).toBe(0);
    expect(review.countsByStatus.revision_required).toBe(0);
    expect(review.items.every((item) => item.reviewDecision.canMoveToReviewPassedPreview)).toBe(true);
    expect(review.items.every((item) => item.publishGate.approvedToPublish === false)).toBe(true);
    expect(review.items[0].passChecklist).toContain("공식 URL이 1개 이상 붙어 있음");
    expect(review.safety.operatorReviewMeans).toBe("pass_hold_revision_preview_not_publish_approval");
  });

  it("keeps review preview empty when humanize preview has no items", async () => {
    const review = await buildPolicyOperatorReviewPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(review.count).toBe(0);
    expect(review.sourceHumanizePreview.count).toBe(0);
    expect(review.items).toEqual([]);
    expect(review.safety.publish).toBe(false);
  });
});
