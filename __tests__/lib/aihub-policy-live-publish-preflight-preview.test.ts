import { describe, expect, it } from "vitest";

import { buildPolicyLivePublishPreflightPreview } from "@/lib/aihub-policy-live-publish-preflight-preview";

describe("AIHub policy live publish preflight preview", () => {
  it("builds a blocked live preflight preview from approval decision previews without publishing", async () => {
    const preview = await buildPolicyLivePublishPreflightPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.status).toBe("read_only_live_publish_preflight_preview");
    expect(preview.count).toBe(2);
    expect(preview.sourceStatus).toBe("approval_decision_preview_approve");
    expect(preview.sourceDecisionPreview.selectedDecision).toBe("approve_for_publish_preview_only");
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.approvalWrite).toBe(false);
    expect(preview.safety.preflightPreviewMeans).toBe("live_publish_blocker_check_only_not_publishable_state");

    const first = preview.items[0];
    expect(first.status).toBe("live_publish_preflight_preview_blocked");
    expect(first.liveGate.readyForLivePublish).toBe(false);
    expect(first.liveActionPlanPreview.requiresFreshOperatorApproval).toBe(true);
    expect(first.requiredBeforeLivePublish).toContain("운영자의 fresh explicit live publish 승인 문구 확보");
    expect(first.blockingReasons).toContain("approval decision preview는 저장된 승인 기록이 아님");
    expect(first.safety.gscSubmit).toBe(false);
  });

  it("keeps live preflight preview empty when source queue is empty", async () => {
    const preview = await buildPolicyLivePublishPreflightPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.sourceDecisionPreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
