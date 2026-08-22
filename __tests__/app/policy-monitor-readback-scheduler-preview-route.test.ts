import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/readback-scheduler-preview.json/route";

describe("policy monitor readback scheduler preview route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns bounded read-only schedule cards without creating cron or external readback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));

    const response = await GET(
      new NextRequest("https://keepioo.test/policy-monitor/readback-scheduler-preview.json?limit=2&sources=1&baseUrl=https://example.test"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("read_only_readback_scheduler_preview");
    expect(body.count).toBe(6);
    expect(body.scheduleSlots).toEqual(["immediate", "after_24h", "after_72h"]);
    expect(body.safety.cronCreate).toBe(false);
    expect(body.safety.externalFetch).toBe(false);
    expect(body.cards[0].canCreateCron).toBe(false);
    expect(body.cards[0].canRunExternalReadback).toBe(false);
  });
});
