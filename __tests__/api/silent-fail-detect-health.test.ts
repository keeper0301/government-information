import { describe, expect, it } from "vitest";
import { hasFreshSuccessfulFetchLog } from "@/lib/analytics/silent-fail-health";

describe("silent-fail-detect fetch log evidence", () => {
  const now = Date.parse("2026-08-31T00:00:00.000Z");

  it("treats fresh successful korea.kr topic fetch as healthy even with no new rows", () => {
    expect(
      hasFreshSuccessfulFetchLog(
        [
          {
            source_code: "korea-kr-topics",
            last_fetched_at: "2026-08-30T23:00:00.000Z",
            last_collected_count: 12,
            last_error: null,
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("does not accept stale, errored, or zero-item fetch logs", () => {
    expect(
      hasFreshSuccessfulFetchLog(
        [
          {
            source_code: "korea-kr-topics",
            last_fetched_at: "2026-08-29T21:00:00.000Z",
            last_collected_count: 12,
            last_error: null,
          },
          {
            source_code: "korea-kr-topics",
            last_fetched_at: "2026-08-30T23:00:00.000Z",
            last_collected_count: 0,
            last_error: null,
          },
          {
            source_code: "korea-kr-topics",
            last_fetched_at: "2026-08-30T23:00:00.000Z",
            last_collected_count: 12,
            last_error: "topic category errors=15",
          },
        ],
        now,
      ),
    ).toBe(false);
  });
});
