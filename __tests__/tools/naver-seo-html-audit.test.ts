import { describe, expect, it } from "vitest";

import {
  analyzeHtml,
  findDuplicateValues,
  mergeAuditUrls,
  parseExtraUrls,
  parseSitemapUrls,
} from "../../tools/naver-seo-html-audit.mjs";

describe("naver-seo-html-audit", () => {
  it("detects crawler-visible heading and image alt issues", () => {
    const result = analyzeHtml(
      `<!doctype html>
      <html>
        <head>
          <title>테스트 정책 — 정책알리미</title>
          <meta name="description" content="대상: 청년 · 지원: 월세 지원 · 마감: 상시 · 지역: 서울 · 출처: 정부 공식" />
        </head>
        <body>
          <h1>테스트 정책</h1>
          <h1 class="hidden print:block">인쇄 제목</h1>
          <img src="/a.png" />
          <img src="/b.png" alt="" />
          <img src="/c.png" alt="테스트 정책 이미지" />
        </body>
      </html>`,
      "https://www.keepioo.com/test",
    );

    expect(result.h1Count).toBe(2);
    expect(result.imgWithoutAltCount).toBe(1);
    expect(result.imgEmptyAltCount).toBe(1);
    expect(result.issues).toEqual(
      expect.arrayContaining(["multiple_h1", "image_missing_alt", "image_empty_alt"]),
    );
  });

  it("passes clean policy HTML", () => {
    const result = analyzeHtml(
      `<!doctype html>
      <html>
        <head>
          <title>천안시 장수축하물품 지원 신청자격·방법 — 정책알리미</title>
          <meta name="description" content="대상: 천안시 어르신 · 지원: 장수축하물품 · 마감: 상시 · 지역: 천안시 · 출처: 천안시" />
        </head>
        <body>
          <h1>장수축하물품 지원</h1>
          <h2 class="hidden print:block">장수축하물품 지원</h2>
          <img src="/card.png" alt="장수축하물품 지원 관련 이미지" />
        </body>
      </html>`,
      "https://www.keepioo.com/welfare/abc",
    );

    expect(result.issues).toEqual([]);
    expect(result.h1Count).toBe(1);
    expect(result.imgWithoutAltCount).toBe(0);
    expect(result.imgEmptyAltCount).toBe(0);
  });

  it("keeps enough row fields for JSON artifacts", () => {
    const result = analyzeHtml(
      `<!doctype html><html><head><title>정책알리미</title><meta name="description" content="정책알리미의 검색엔진 진단 테스트용으로 충분한 길이를 가진 설명 문장입니다." /><link rel="canonical" href="https://www.keepioo.com/" /></head><body><h1>정책알리미</h1></body></html>`,
      "https://www.keepioo.com/",
    );

    expect(result).toMatchObject({
      url: "https://www.keepioo.com/",
      title: "정책알리미",
      canonical: "https://www.keepioo.com/",
      h1Count: 1,
      issues: [],
    });
  });

  it("reports duplicate titles and descriptions by URL", () => {
    const rows = [
      { url: "https://www.keepioo.com/a", title: "같은 제목", description: "같은 설명" },
      { url: "https://www.keepioo.com/b", title: "같은 제목", description: "같은 설명" },
      { url: "https://www.keepioo.com/c", title: "다른 제목", description: "다른 설명" },
    ];

    expect(findDuplicateValues(rows, "title")).toEqual([
      { value: "같은 제목", count: 2, urls: ["https://www.keepioo.com/a", "https://www.keepioo.com/b"] },
    ]);
    expect(findDuplicateValues(rows, "description")).toHaveLength(1);
  });

  it("parses sitemap loc URLs", () => {
    expect(
      parseSitemapUrls(`<?xml version="1.0"?><urlset><url><loc>https://www.keepioo.com/</loc></url><url><loc>https://www.keepioo.com/news</loc></url></urlset>`),
    ).toEqual(["https://www.keepioo.com/", "https://www.keepioo.com/news"]);
  });

  it("parses line or comma separated extra URLs", () => {
    expect(parseExtraUrls("https://www.keepioo.com/a\nhttps://www.keepioo.com/b, https://www.keepioo.com/c"))
      .toEqual([
        "https://www.keepioo.com/a",
        "https://www.keepioo.com/b",
        "https://www.keepioo.com/c",
      ]);
  });

  it("adds extra URLs after the sitemap sample and deduplicates them", () => {
    expect(
      mergeAuditUrls(
        ["https://www.keepioo.com/", "https://www.keepioo.com/guides", "https://www.keepioo.com/refund"],
        ["https://www.keepioo.com/refund", "https://www.keepioo.com/welfare/example"],
        2,
      ),
    ).toEqual([
      "https://www.keepioo.com/",
      "https://www.keepioo.com/guides",
      "https://www.keepioo.com/refund",
      "https://www.keepioo.com/welfare/example",
    ]);
  });
});
