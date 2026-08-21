import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/humanize-preview.json/route";

describe("policy monitor humanize preview route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns read-only humanized preview JSON", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const request = new NextRequest("https://keepioo.test/policy-monitor/humanize-preview.json?limit=2&sources=1");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("read_only_humanized_preview");
    expect(payload.count).toBe(2);
    expect(payload.countsByStatus.humanized_preview_ready).toBe(2);
    expect(payload.safety.publish).toBe(false);
    expect(payload.items[0].qualityGate.needsOperatorReview).toBe(true);
  });
});
