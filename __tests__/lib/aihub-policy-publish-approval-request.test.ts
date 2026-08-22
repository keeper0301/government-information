import { describe, expect, it } from "vitest";

import { buildPolicyPublishApprovalRequestPreview } from "@/lib/aihub-policy-publish-approval-request";

describe("AIHub policy publish approval request preview", () => {
  it("wraps W8 publish packages into operator approval request prompts without saving approval", async () => {
    const preview = await buildPolicyPublishApprovalRequestPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.status).toBe("read_only_publish_approval_request_preview");
    expect(preview.count).toBe(2);
    expect(preview.sourceStatus).toBe("publish_package_preview");
    expect(preview.decisionOptions).toEqual([
      "approve_for_publish_preview_only",
      "hold_for_source_readback",
      "request_revision",
    ]);
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.approvalWrite).toBe(false);
    expect(preview.safety.approvalRequestPreviewMeans).toBe("operator_decision_prompt_only_not_saved_not_published");

    const first = preview.items[0];
    expect(first.status).toBe("approval_request_preview");
    expect(first.approvalQuestion).toContain(first.title);
    expect(first.bodyPreviewDigest.length).toBeLessThanOrEqual(240);
    expect(first.officialSources.length).toBe(1);
    expect(first.requiredAcknowledgements).toContain("승인 버튼이나 실제 발행 동작을 실행하지 않음");
    expect(first.publishGate.approvedToPublish).toBe(false);
    expect(first.safety.approvalWrite).toBe(false);
  });

  it("keeps approval request preview empty when W8 has no packages", async () => {
    const preview = await buildPolicyPublishApprovalRequestPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.sourcePublishPackagePreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
