import { describe, expect, it } from "vitest";

import { buildPolicyPublishApprovalDecisionPreview } from "@/lib/aihub-policy-publish-approval-decision-preview";

describe("AIHub policy publish approval decision preview", () => {
  it("previews a selected approval decision receipt without recording or publishing", async () => {
    const preview = await buildPolicyPublishApprovalDecisionPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
      selectedDecision: "approve_for_publish_preview_only",
    });

    expect(preview.status).toBe("read_only_publish_approval_decision_preview");
    expect(preview.count).toBe(2);
    expect(preview.sourceStatus).toBe("approval_request_preview");
    expect(preview.selectedDecision).toBe("approve_for_publish_preview_only");
    expect(preview.safety.approvalWrite).toBe(false);
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.decisionPreviewMeans).toBe("selected_decision_receipt_preview_only_not_saved_not_published");

    const first = preview.items[0];
    expect(first.status).toBe("approval_decision_preview_approve");
    expect(first.approvalReceiptPreview.decisionRecorded).toBe(false);
    expect(first.approvalReceiptPreview.canProceedToLivePublish).toBe(false);
    expect(first.approvalReceiptPreview.requiresSeparateLiveApproval).toBe(true);
    expect(first.requiredReadbackBeforeLive).toContain("live publish, GSC, IndexNow, Naver submit은 별도 명시 승인 전까지 금지");
  });

  it("defaults to hold-for-readback decision preview", async () => {
    const preview = await buildPolicyPublishApprovalDecisionPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 1,
      sourceLimit: 1,
    });

    expect(preview.selectedDecision).toBe("hold_for_source_readback");
    expect(preview.items[0].status).toBe("approval_decision_preview_hold");
    expect(preview.items[0].nextStepPreview).toContain("공식 출처");
  });

  it("keeps decision preview empty when W9 has no request items", async () => {
    const preview = await buildPolicyPublishApprovalDecisionPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.sourceApprovalRequestPreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
