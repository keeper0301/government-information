import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/publish-package-preview.json/route";

describe("policy monitor publish package preview route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a bounded read-only publish package preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));

    const response = await GET(new NextRequest("https://keepioo.test/policy-monitor/publish-package-preview.json?limit=2&sources=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("read_only_publish_package_preview");
    expect(body.count).toBe(2);
    expect(body.sourceStatus).toBe("review_passed_preview");
    expect(body.safety.publish).toBe(false);
    expect(body.items[0].publishGate.approvedToPublish).toBe(false);
    expect(body.items[0].bodyPreview).toContain("### 발행 전 확인 필요");
  });
});
