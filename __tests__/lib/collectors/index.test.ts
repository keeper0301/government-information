import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/collectors";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries transient fetch failures before throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com/api", {
      retries: 2,
      retryDelayMs: 0,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after retry budget is exhausted", async () => {
    const lastError = new TypeError("fetch failed after retries");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(lastError);

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithTimeout("https://example.com/api", {
        retries: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toBe(lastError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
