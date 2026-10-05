import { describe, expect, it } from "vitest";
import { safeNewsThumbnailUrl } from "@/lib/news-thumbnail";

describe("safeNewsThumbnailUrl", () => {
  it("확인한 자료사진만 허용하고 임의의 내부 경로는 차단한다", () => {
    expect(safeNewsThumbnailUrl("/images/news/jeongeup-market.webp")).toBe("/images/news/jeongeup-market.webp");
    expect(safeNewsThumbnailUrl("/images/news/unknown.webp")).toBeNull();
    expect(safeNewsThumbnailUrl("/images/news/jeongeup-market.webp", "example.com")).toBeNull();
  });
  it("외부 언론사 source_outlet 이 있으면 썸네일을 차단한다", () => {
    expect(safeNewsThumbnailUrl("https://cdn.pressian.com/a.jpg", "pressian.com")).toBeNull();
  });

  it("korea.kr HTTPS 썸네일만 허용한다", () => {
    expect(safeNewsThumbnailUrl("https://www.korea.kr/news.jpg", null)).toBe("https://www.korea.kr/news.jpg");
    expect(safeNewsThumbnailUrl("http://www.korea.kr/news.jpg", null)).toBeNull();
    expect(safeNewsThumbnailUrl("https://example.com/news.jpg", null)).toBeNull();
  });
});
