import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/humanize-review-queue.json/route";

describe("policy monitor humanize/review queue route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a bounded read-only humanize/review queue", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));

    const request = new NextRequest("https://keepioo.test/policy-monitor/humanize-review-queue.json?limit=2&sources=1");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(json.status).toBe("read_only_humanize_review_queue");
    expect(json.count).toBe(2);
    expect(json.countsByStatus.humanize_required).toBe(2);
    expect(json.safety.publish).toBe(false);
    expect(json.items[0].nextAction).toBe("run_humanize_korean_then_operator_review");
  });
});
