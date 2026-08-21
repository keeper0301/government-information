import { describe, expect, it } from "vitest";

import { GET as queueGET } from "@/app/policy-monitor/queue.json/route";

describe("policy monitor draft queue route", () => {
  it("returns a read-only queue preview with no promotion before fact readback", async () => {
    const response = queueGET();
    const body = await response.json();

    expect(body.status).toBe("read_only_queue_preview");
    expect(body.year).toBe(2026);
    expect(body.count).toBe(40);
    expect(body.countsByStatus.needs_fact_readback).toBe(40);
    expect(body.countsByStatus.ready_for_draft).toBe(0);
    expect(body.safety.dbWrite).toBe(false);
    expect(body.safety.publish).toBe(false);
    expect(body.safety.gscSubmit).toBe(false);
    expect(body.safety.indexNowSubmit).toBe(false);
    expect(body.safety.naverSubmit).toBe(false);
    expect(body.items[0].promotionBlockedReason).toContain("공식 원문 readback 전");
  });
});
