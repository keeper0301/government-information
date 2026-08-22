import { describe, expect, it } from "vitest";

import { buildPolicyLiveReadbackPreview } from "@/lib/aihub-policy-live-readback-preview";

describe("AIHub policy live readback preview", () => {
  it("builds a post-publish readback plan without publishing or submitting", async () => {
    const preview = await buildPolicyLiveReadbackPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
      baseUrl: "https://example.test",
    });

    expect(preview.status).toBe("read_only_live_readback_preview");
    expect(preview.count).toBe(2);
    expect(preview.sourceStatus).toBe("live_publish_preflight_preview_blocked");
    expect(preview.safety.publish).toBe(false);
    expect(preview.safety.gscSubmit).toBe(false);
    expect(preview.safety.indexNowSubmit).toBe(false);
    expect(preview.safety.externalFetch).toBe(false);
    expect(preview.safety.liveReadbackPreviewMeans).toBe("post_publish_verification_plan_only_not_a_publish_or_submit_action");

    const first = preview.items[0];
    expect(first.status).toBe("live_readback_preview_waiting_for_published_url");
    expect(first.expectedPublishedUrlPreview.startsWith("https://example.test/policy/")).toBe(true);
    expect(first.liveGate.publishedUrlKnown).toBe(false);
    expect(first.liveGate.readyForDone).toBe(false);
    expect(first.readbackTargets.map((target) => target.name)).toContain("published_page_http_readback");
    expect(first.readbackTargets.every((target) => target.liveRequestSent === false)).toBe(true);
    expect(first.liveVerificationChecklist).toContain("실제 발행 완료 후 공개 URL HTTP 2xx 확인");
    expect(first.monitoringPlanPreview.after24h).toContain("GSC page/query readback");
  });

  it("keeps readback preview empty when no source item passes preflight input", async () => {
    const preview = await buildPolicyLiveReadbackPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
    });

    expect(preview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.sourcePreflightPreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
