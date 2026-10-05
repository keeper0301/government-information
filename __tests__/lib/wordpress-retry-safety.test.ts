import { describe, expect, it } from "vitest";
import { shouldAutoReleaseToWordPress } from "@/lib/wordpress/retry-safety";

const failed = (message: string, id: number | null = null) => ({
  status: "failed", wp_post_id: id, error_message: message,
});

describe("WordPress automatic retry safety", () => {
  it("releases only when no WP call occurred or auth failed before creation", () => {
    expect(shouldAutoReleaseToWordPress(null, null)).toBe(true);
    expect(shouldAutoReleaseToWordPress(failed('HTTP 401: rest_cannot_create'), null)).toBe(true);
    expect(shouldAutoReleaseToWordPress(failed('HTTP 403: rest_forbidden'), null)).toBe(true);
  });
  it("blocks duplicate posting for drafts, known IDs, ambiguous timeout or DB lookup errors", () => {
    expect(shouldAutoReleaseToWordPress({ status: "skipped", wp_post_id: 18489, error_message: "draft" }, null)).toBe(false);
    expect(shouldAutoReleaseToWordPress({ status: "published", wp_post_id: 18489, error_message: null }, null)).toBe(false);
    expect(shouldAutoReleaseToWordPress(failed('HTTP 401: malformed', 18489), null)).toBe(false);
    expect(shouldAutoReleaseToWordPress(failed('timeout 15000ms'), null)).toBe(false);
    expect(shouldAutoReleaseToWordPress(failed('network: reset'), null)).toBe(false);
    expect(shouldAutoReleaseToWordPress(failed('HTTP 500: unknown'), null)).toBe(false);
    expect(shouldAutoReleaseToWordPress(null, { message: "DB down" })).toBe(false);
  });
});
