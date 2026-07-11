import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/csp-report/route";

describe("POST /api/csp-report", () => {
  it("accepts a valid CSP report without echoing the body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await POST(new Request("https://example.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({
        "csp-report": {
          "blocked-uri": "eval",
          "violated-directive": "script-src",
          "effective-directive": "script-src",
          disposition: "report",
          "line-number": 1,
          "status-code": 200,
        },
      }),
    }));

    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("rejects malformed reports", async () => {
    const res = await POST(new Request("https://example.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    }));

    expect(res.status).toBe(400);
  });

  it("rejects oversized reports before parsing", async () => {
    const res = await POST(new Request("https://example.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(20000) } }),
    }));

    expect(res.status).toBe(413);
  });
});
