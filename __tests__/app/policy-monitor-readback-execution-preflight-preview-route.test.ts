import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/policy-monitor/readback-execution-preflight-preview.json/route";

describe("policy-monitor readback execution preflight preview route", () => {
  it("returns no-store read-only W14 execution preflight preview JSON", async () => {
    const request = new NextRequest(
      "https://example.com/policy-monitor/readback-execution-preflight-preview.json?limit=2&sources=1&baseUrl=https://example.test&slot=after_72h",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("read_only_readback_execution_preflight_preview");
    expect(body.requestedSlot).toBe("after_72h");
    expect(body.sourceStatus).toBe("readback_schedule_preview_pending_live_publish");
    expect(body.count).toBe(2);
    expect(body.safety.cronCreate).toBe(false);
    expect(body.safety.externalFetch).toBe(false);
    expect(body.items[0].status).toBe("readback_execution_preflight_preview_blocked");
    expect(body.items[0].slot).toBe("after_72h");
    expect(body.items[0].canRunNow).toBe(false);
    expect(body.items[0].canFetchExternal).toBe(false);
  }, 15_000);
});
