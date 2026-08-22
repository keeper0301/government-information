import { describe, expect, it } from "vitest";

import { buildPolicyPublishPackagePreview } from "@/lib/aihub-policy-publish-package-preview";

describe("AIHub policy publish package preview", () => {
  it("packages review_passed_preview items for approval without publishing", async () => {
    const preview = await buildPolicyPublishPackagePreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.status).toBe("read_only_publish_package_preview");
    expect(preview.sourceStatus).toBe("review_passed_preview");
    expect(preview.count).toBe(2);
    expect(preview.packageFields).toEqual([
      "title",
      "bodyPreview",
      "metaDescription",
      "officialSources",
      "prePublishApprovalChecklist",
    ]);
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.publishPackagePreviewMeans).toBe("approval_package_only_not_live_publish");

    const first = preview.items[0];
    expect(first.status).toBe("publish_package_preview");
    expect(first.title).toBeTruthy();
    expect(first.bodyPreview).toContain("2026년 기준 신청 대상");
    expect(first.bodyPreview).toContain("### 공식 출처");
    expect(first.metaDescription.length).toBeLessThanOrEqual(155);
    expect(first.officialSources.length).toBe(1);
    expect(first.prePublishApprovalChecklist).toContain("최종 승인 전 DB write, publish, GSC, IndexNow, Naver submit이 모두 false임");
    expect(first.publishGate.approvedToPublish).toBe(false);
  });

  it("keeps package preview empty when no review item passes", async () => {
    const preview = await buildPolicyPublishPackagePreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.sourceOperatorReview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
