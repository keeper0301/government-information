import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const DAILY_CACHE = "public, s-maxage=86400, stale-while-revalidate=31449600";
const SHORT_CACHE = "public, s-maxage=60, stale-while-revalidate=31535940";

function cacheControlFor(source: string): string | undefined {
  return config.headers
    ?.find((entry) => entry.source === source)
    ?.headers.find((header) => header.key.toLowerCase() === "cache-control")?.value;
}

describe("vercel public page cache headers", () => {
  it("sets platform-level cache headers for safe public pages", () => {
    for (const source of [
      "/help",
      "/privacy",
      "/terms",
      "/refund",
      "/consult",
      "/login",
      "/signup",
      "/signup/sent",
      "/forgot-password",
      "/reset-password",
    ]) {
      expect(cacheControlFor(source)).toBe(DAILY_CACHE);
    }

    expect(cacheControlFor("/guides")).toBe(SHORT_CACHE);
  });

  it("does not platform-cache user-specific or protected pages", () => {
    for (const source of ["/pricing", "/admin", "/mypage", "/checkout", "/?ref=ABCDEF"]) {
      expect(cacheControlFor(source)).toBeUndefined();
    }
  });
});
