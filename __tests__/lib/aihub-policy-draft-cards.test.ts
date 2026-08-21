import { describe, expect, it } from "vitest";

import { buildPolicyDraftCardPreview } from "@/lib/aihub-policy-draft-cards";

describe("AIHub policy draft cards", () => {
  it("builds humanize/review draft cards only from successful readback preview items", async () => {
    const preview = await buildPolicyDraftCardPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.status).toBe("read_only_draft_card_preview");
    expect(preview.count).toBe(2);
    expect(preview.countsByStatus.humanize_required).toBe(2);
    expect(preview.countsByStatus.review_required).toBe(0);
    expect(preview.cards.every((card) => card.status === "humanize_required")).toBe(true);
    expect(preview.cards.every((card) => card.humanizeGate.required)).toBe(true);
    expect(preview.cards.every((card) => card.reviewGate.required)).toBe(true);
    expect(preview.cards[0].outline.length).toBeGreaterThan(0);
    expect(preview.cards[0].factsToVerify).toContain("2026년 신청 기간·마감일");
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.draftCardMeans).toBe("humanize_and_review_required_preview_not_publish_approval");
  });

  it("keeps draft cards empty when official readback has no success", async () => {
    const preview = await buildPolicyDraftCardPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.sourceReadback.countsByStatus.ready_for_draft).toBe(0);
    expect(preview.cards).toEqual([]);
  });
});
