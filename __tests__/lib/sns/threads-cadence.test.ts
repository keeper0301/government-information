import { describe, expect, it } from "vitest";
import { applyThreadsCadence, createThreadsCadenceState } from "@/lib/sns/threads-cadence";

describe("threads-cadence", () => {
  it("defaults Threads publishing to one successful post per 24h", () => {
    const state = createThreadsCadenceState([
      {
        created_at: "2026-06-27T01:00:00.000Z",
        details: { id: "post-1", results: [{ channel: "threads", ok: true }] },
      },
    ]);

    const decision = applyThreadsCadence(["twitter", "threads"], state, new Date("2026-06-27T12:00:00.000Z"));

    expect(decision).toEqual({
      channels: ["twitter"],
      skippedReason: "threads_daily_cap_reached",
    });
  });

  it("reserves only one Threads attempt per batch even before a success is logged", () => {
    const state = createThreadsCadenceState([]);

    const first = applyThreadsCadence(["threads"], state, new Date("2026-06-27T12:00:00.000Z"));
    const second = applyThreadsCadence(["threads"], state, new Date("2026-06-27T12:01:00.000Z"));

    expect(first).toEqual({ channels: ["threads"] });
    expect(second).toEqual({
      channels: [],
      skippedReason: "threads_daily_cap_reached",
    });
  });

  it("keeps Threads below the configured minimum interval", () => {
    const state = createThreadsCadenceState(
      [
        {
          created_at: "2026-06-27T01:00:00.000Z",
          details: { id: "post-1", results: [{ channel: "threads", ok: true }] },
        },
      ],
      { THREADS_DAILY_CAP: "2", THREADS_MIN_HOURS_BETWEEN_POSTS: "24" },
    );

    const decision = applyThreadsCadence(["facebook", "threads"], state, new Date("2026-06-27T12:00:00.000Z"));

    expect(decision).toEqual({
      channels: ["facebook"],
      skippedReason: "threads_min_interval",
    });
  });

  it("allows another Threads post after both cap and interval allow it", () => {
    const state = createThreadsCadenceState(
      [
        {
          created_at: "2026-06-26T01:00:00.000Z",
          details: { id: "post-1", results: [{ channel: "threads", ok: true }] },
        },
      ],
      { THREADS_DAILY_CAP: "2", THREADS_MIN_HOURS_BETWEEN_POSTS: "24" },
    );

    const decision = applyThreadsCadence(["threads"], state, new Date("2026-06-27T02:00:00.000Z"));

    expect(decision).toEqual({ channels: ["threads"] });
  });
});
