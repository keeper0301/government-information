import { describe, expect, it } from "vitest";
import { summarizeWordPressResult } from "@/lib/wordpress/result-summary";

describe("WordPress failure diagnostics", () => {
  it.each([401, 403, 500, 502])("reports HTTP %s and allows only definite auth rejection", (httpStatus) => {
    expect(summarizeWordPressResult({ ok: false, reason: "api_error", error: `HTTP ${httpStatus}: sensitive body`, httpStatus })).toEqual({
      status: "failed", reason: "api_error", httpStatus, retryEligible: httpStatus === 401 || httpStatus === 403,
    });
  });
  it.each(["timeout", "network_error", "api_error"] as const)("blocks ambiguous %s", (reason) => {
    expect(summarizeWordPressResult({ ok: false, reason, error: "unknown response" })).toMatchObject({ status: "failed", reason, retryEligible: false });
  });
  it("preserves known IDs on log failure and held drafts without allowing repost", () => {
    expect(summarizeWordPressResult({ ok: false, reason: "log_error", wpPostId: 42, wpPostUrl: "https://info.keeper0301.com/post/" })).toMatchObject({ wpPostId: 42, retryEligible: false });
    expect(summarizeWordPressResult({ ok: false, reason: "held_for_review", wpPostId: 42, wpPostUrl: "https://info.keeper0301.com/post/" })).toMatchObject({ status: "held_for_review", wpPostId: 42, retryEligible: false });
  });
});
