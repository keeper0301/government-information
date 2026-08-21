import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/policy-monitor/draft-cards.json/route";

describe("policy monitor draft cards route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns read-only humanize/review draft card preview", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));

    const request = new NextRequest("https://www.keepioo.com/policy-monitor/draft-cards.json?limit=2&sources=1");
    const response = await GET(request);
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("read_only_draft_card_preview");
    expect(body.count).toBe(2);
    expect(body.countsByStatus.humanize_required).toBe(2);
    expect(body.safety.publish).toBe(false);
    expect(body.safety.dbWrite).toBe(false);
    expect(body.cards[0].humanizeGate.required).toBe(true);
    expect(body.cards[0].reviewGate.required).toBe(true);
  });
});
