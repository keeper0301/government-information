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

  it("parses slash formatted Suwon list dates instead of falling back to now", () => {
    expect(citiesSource).toContain('cityName: "수원시"');
    expect(citiesSource).toContain('dateTextRe: "(\\\\d{4})/(\\\\d{2})/(\\\\d{2})"');
  });

  it("uses direct Uijeongbu bbs list and commit wait for Bucheon proxy stability", () => {
    expect(citiesSource).toContain(
      "https://www.ui4u.go.kr/portal/bbs/list.do?mId=0301020000&ptIdx=1709",
    );
    expect(citiesSource).toContain("static proxy list matched");
    expect(citiesSource).toContain("scrapeUijeongbuBrowser");
    expect(citiesSource).toContain('cityName: "부천시"');
    expect(citiesSource).toContain('navWait: "commit"');
    expect(citiesSource).toContain("listTimeout: 120000");
    expect(citiesSource).toContain("bucheon: scrapeBucheon");
  });
});
