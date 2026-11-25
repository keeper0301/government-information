import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKeepiooAdSenseSiteState } from "@/lib/external-console/adsense";

const publisher = "accounts/pub-1234";
const network = vi.fn();
const result = (sites: unknown[], nextPageToken?: string) => Response.json({ sites, nextPageToken });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ADSENSE_ID", "ca-pub-1234");
  vi.stubEnv("ADSENSE_CLIENT_ID", "fixture");
  vi.stubEnv("ADSENSE_CLIENT_SECRET", "fixture");
  vi.stubEnv("ADSENSE_REFRESH_TOKEN", "fixture");
  vi.stubGlobal("fetch", network);
  network.mockReset().mockResolvedValueOnce(Response.json({ access_token: "fixture" }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("AdSense site-level approval", () => {
  it("queries only the configured account and distinguishes another site's approval from Keepioo", async () => {
    network.mockResolvedValueOnce(result([
      { domain: "www.keepioo.com", state: "READY" },
      { domain: "other.example", state: "READY" },
      { domain: "keepioo.com", state: "NEEDS_ATTENTION" },
    ]));
    expect(await getKeepiooAdSenseSiteState()).toBe("NEEDS_ATTENTION");
    expect(network.mock.calls[1][0]).toBe(`https://adsense.googleapis.com/v2/${publisher}/sites`);
  });

  it("reads the exact site across pages and handles tokens as opaque query values", async () => {
    network.mockResolvedValueOnce(result([], "safe&next"));
    network.mockResolvedValueOnce(result([{ domain: "keepioo.com", state: "READY" }]));
    expect(await getKeepiooAdSenseSiteState()).toBe("READY");
    const url = new URL(network.mock.calls[2][0]);
    expect(url.searchParams.get("pageToken")).toBe("safe&next");
    expect([...url.searchParams.keys()]).toEqual(["pageToken"]);
  });

  it("does not treat a partial scan, duplicate or error as an approval", async () => {
    network.mockResolvedValueOnce(result([{ domain: "keepioo.com", state: "READY" }], "next"));
    network.mockResolvedValueOnce(result([{ domain: "keepioo.com", state: "NEEDS_ATTENTION" }]));
    expect(await getKeepiooAdSenseSiteState()).toBeNull();
    network.mockReset().mockResolvedValueOnce(Response.json({ access_token: "fixture" }));
    network.mockResolvedValueOnce(result([{ domain: "keepioo.com", state: "READY" }], "next"));
    network.mockResolvedValueOnce(new Response("provider error", { status: 503 }));
    expect(await getKeepiooAdSenseSiteState()).toBeNull();
  });

  it("does not call Google if the publisher configuration is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ID", "");
    expect(await getKeepiooAdSenseSiteState()).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
});
