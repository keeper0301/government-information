import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { EDITORIAL_NEWS } from "@/lib/editorial-news-data";
import { getEditorialNewsPhoto } from "@/lib/editorial-news-images";
import { safeNewsThumbnailUrl } from "@/lib/news-thumbnail";
import { EditorialNewsCards, EditorialNewsDetail } from "@/components/news/editorial-news-pages";

vi.mock("@/lib/policy-guides", () => ({ getGuides: async () => [] }));
const automatic = { ...EDITORIAL_NEWS[0], slug: "policy-brief-148972905",
  title: "중장년 구직자 관광산업 취업 지원", automaticPublication: { checkedAt: "2026-10-07T00:00:00Z", sourceHash: "검사용" } };

describe("자동 뉴스 자료사진", () => {
  it("새 주소의 목록과 상세에 사진과 출처·이용 조건을 함께 제공한다", async () => {
    const card = renderToStaticMarkup(<EditorialNewsCards articles={[automatic]} />);
    const detail = renderToStaticMarkup(await EditorialNewsDetail({ article: automatic }));
    for (const html of [card, detail]) {
      expect(html).toContain("seoul-city-");
      expect(html).toContain("BI3QWQ");
      expect(html).toContain("by-sa/4.0/deed.ko");
      expect(html).toContain("기사 현장 사진이 아닙니다");
    }
    expect(detail).toContain('"image":"https://www.keepioo.com/images/news/seoul-city.webp"');
  });
  it("상세의 해상도 선언은 실제 사진 크기와 일치한다", async () => {
    for (const article of [automatic, EDITORIAL_NEWS[0], { slug: "finance", title: "신용 회복" }]) {
      const photo = getEditorialNewsPhoto(article);
      const actual = await sharp(`public${photo.url}`).metadata();
      expect({ width: photo.width, height: photo.height }).toEqual({ width: actual.width, height: actual.height });
    }
  });
  it("금융 제목과 기존 지정 사진을 구분하고 모든 크기 파일을 제공한다", () => {
    const finance = getEditorialNewsPhoto({ slug: "new-finance", title: "소상공인 대출 조건" });
    expect(finance.url).toBe("/images/news/calculator.webp");
    expect(getEditorialNewsPhoto(EDITORIAL_NEWS[0]).author).toBe("Ulrich Lange");
    for (const article of [automatic, EDITORIAL_NEWS[0], { slug: "finance", title: "신용 회복" }]) {
      const photo = getEditorialNewsPhoto(article);
      expect(safeNewsThumbnailUrl(photo.url)).toBe(photo.url);
      expect(safeNewsThumbnailUrl(photo.url, "external.example")).toBeNull();
      for (const suffix of ["", "-480", "-640"]) {
        expect(existsSync(`public${photo.url.replace(".webp", `${suffix}.webp`)}`)).toBe(true);
      }
    }
    expect(safeNewsThumbnailUrl("/images/news/unknown.webp")).toBeNull();
  });
});
