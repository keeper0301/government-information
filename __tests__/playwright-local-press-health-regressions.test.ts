import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const citiesSource = readFileSync(
  join(process.cwd(), "playwright/lib/cities.mjs"),
  "utf8",
);
const factorySource = readFileSync(
  join(process.cwd(), "playwright/lib/_factory.mjs"),
  "utf8",
);

describe("Playwright local-press collector health regressions", () => {
  it("uses a Chrome UA fallback for Geumjeong attachment fetches", () => {
    expect(citiesSource).toContain("const CHROME_UA");
    expect(citiesSource).toContain(
      "`${BASE}/board/list.geumj?boardId=BBS_0000005`,\n    { userAgent: CHROME_UA },",
    );
    expect(citiesSource).toContain(
      "(url) => fetchBinViaProxy(url, { userAgent: CHROME_UA })",
    );
  });

  it("keeps Yangcheon article body ahead of the KOGL license block", () => {
    expect(citiesSource).toContain(
      'bodySelectors: [".view-content", ".view_contents"]',
    );
  });

  it("allows slow detail pages to opt into a longer timeout", () => {
    expect(factorySource).toContain("detailTimeout = null");
    expect(factorySource).toContain("timeout: detailTimeout || DETAIL_TIMEOUT");
    expect(citiesSource).toContain("detailTimeout: 45000");
  });
});
