import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/live-publish-preflight-preview.json/route";

describe("policy monitor live publish preflight preview route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a bounded read-only live preflight preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));

    const response = await GET(
      new NextRequest("https://keepioo.test/policy-monitor/live-publish-preflight-preview.json?limit=2&sources=1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("read_only_live_publish_preflight_preview");
    expect(body.count).toBe(2);
    expect(body.sourceStatus).toBe("approval_decision_preview_approve");
    expect(body.safety.publish).toBe(false);
    expect(body.safety.approvalWrite).toBe(false);
    expect(body.items[0].liveGate.readyForLivePublish).toBe(false);
  });
});
