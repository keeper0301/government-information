import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/operator-review.json/route";

describe("policy monitor operator review route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a bounded read-only operator review preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));

    const response = await GET(new NextRequest("https://keepioo.test/policy-monitor/operator-review.json?limit=2&sources=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("read_only_operator_review_preview");
    expect(body.count).toBe(2);
    expect(body.countsByStatus.review_passed_preview).toBe(2);
    expect(body.safety.publish).toBe(false);
    expect(body.items[0].publishGate.approvedToPublish).toBe(false);
  });
});
