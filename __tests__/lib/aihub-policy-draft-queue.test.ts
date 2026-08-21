import { describe, expect, it } from "vitest";

import {
  buildPolicyDraftQueueItems,
  POLICY_DRAFT_QUEUE_STATUSES,
  summarizePolicyDraftQueue,
} from "@/lib/aihub-policy-draft-queue";
import { AIHUB_POLICY_OPPORTUNITIES, buildPolicyExportRows } from "@/lib/aihub-policy-opportunities";

describe("AIHub policy draft queue", () => {
  it("turns export rows into read-only draft candidate queue items", () => {
    const rows = buildPolicyExportRows();
    const items = buildPolicyDraftQueueItems(rows);

    expect(items).toHaveLength(rows.length);
    expect(items[0].source).toBe("aihub_policy_monitor_export");
    expect(items[0].status).toBe("needs_fact_readback");
    expect(items[0].id).toContain("aihub4-2026");
    expect(items[0].readbackCandidates.length).toBeGreaterThan(0);
    expect(items[0].requiredBeforePromotion).toContain("official_source_readback");
  });

  it("keeps all W2 items blocked from draft promotion until official readback", () => {
    const summary = summarizePolicyDraftQueue();

    expect(summary.status).toBe("read_only_queue_preview");
    expect(summary.count).toBe(AIHUB_POLICY_OPPORTUNITIES.length * 4 * 2);
    expect(summary.allowedStatuses).toEqual(POLICY_DRAFT_QUEUE_STATUSES);
    expect(summary.countsByStatus.needs_fact_readback).toBe(summary.count);
    expect(summary.countsByStatus.ready_for_draft).toBe(0);
    expect(summary.countsByStatus.humanize_required).toBe(0);
    expect(summary.countsByStatus.review_required).toBe(0);
    expect(summary.safety.dbWrite).toBe(false);
    expect(summary.safety.publish).toBe(false);
    expect(summary.safety.promotionRequiresOfficialReadback).toBe(true);
  });
});
