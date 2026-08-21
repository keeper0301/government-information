import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/readback-preview.json/route";

describe("policy monitor official readback preview route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns bounded read-only W3 preview with ready_for_draft candidates from successful source checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new Response("ok", {
          status: url.includes("gov.kr") ? 200 : 404,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const response = await GET(new NextRequest("https://www.keepioo.com/policy-monitor/readback-preview.json?limit=2&sources=1"));
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("read_only_official_readback_preview");
    expect(body.count).toBe(2);
    expect(body.readbackLimit).toBe(2);
    expect(body.readbackSourceLimit).toBe(1);
    expect(body.countsByStatus.ready_for_draft).toBeGreaterThan(0);
    expect(body.safety.dbWrite).toBe(false);
    expect(body.safety.naverSubmit).toBe(false);
  });
});
