import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectInstagramMediaInsights, mapInstagramInsights } from "@/lib/instagram/insights";

describe("Instagram insights client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Graph insight values to compact metric keys", () => {
    expect(
      mapInstagramInsights([
        { name: "reach", values: [{ value: 12 }] },
        { name: "saved", values: [{ value: "3" }] },
        { name: "shares", values: [{ value: 2 }] },
        { name: "profile_activity", values: [{ value: 1 }] },
      ]),
    ).toEqual({ reach: 12, saved: 3, shares: 2, profile_activity: 1 });
  });

  it("falls back when an unsupported metric set fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "unsupported metric" } }), { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { name: "reach", values: [{ value: 5 }] },
              { name: "saved", values: [{ value: 1 }] },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await collectInstagramMediaInsights("media-1", "token");

    expect(result.metrics).toMatchObject({ reach: 5, saved: 1 });
    expect(result.errors).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
