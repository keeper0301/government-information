import { describe, expect, it } from "vitest";

import { GET as csvGET } from "@/app/policy-monitor/export.csv/route";
import { GET as jsonGET } from "@/app/policy-monitor/export.json/route";

describe("policy monitor export routes", () => {
  it("returns read-only JSON candidate rows with readback candidates", async () => {
    const response = jsonGET();
    const body = await response.json();

    expect(body.status).toBe("read_only_export");
    expect(body.year).toBe(2026);
    expect(body.count).toBeGreaterThan(0);
    expect(body.safety.dbWrite).toBe(false);
    expect(body.safety.requiresFactReadbackBeforeDraft).toBe(true);
    expect(body.rows[0].status).toBe("needs_fact_readback");
    expect(body.rows[0].readbackCandidates.length).toBeGreaterThan(0);
  });

  it("returns CSV export with attachment headers", async () => {
    const response = csvGET();
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("aihub-policy-monitor-2026.csv");
    expect(text).toContain("readbackCandidateUrls");
    expect(text).toContain("needs_fact_readback");
  });
});
