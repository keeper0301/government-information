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

  it("allows detail pages that never reach networkidle to lower only the detail wait condition", () => {
    expect(factorySource).toContain("detailNavWait = null");
    expect(factorySource).toContain("waitUntil: detailNavWait || NAV_WAIT");
    expect(citiesSource).toContain('detailNavWait: "domcontentloaded"');
  });

  it("uses the redesigned Seongnam homepage press slider and detail body/date fields", () => {
    expect(citiesSource).toContain("https://www.seongnam.go.kr/index");
    expect(citiesSource).toContain(".notice-box1 .swiper-slide");
    expect(citiesSource).toContain("/bbs010501/");
    expect(citiesSource).toContain(".board-view-content, .board-view-body");
    expect(citiesSource).toMatch(/등록일\\s\*/);
  });
});
