import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { EDITORIAL_NEWS } from "@/lib/editorial-news-data";
import { EDITORIAL_PHOTO_URLS, getEditorialNewsPhoto } from "@/lib/editorial-news-images";
import { NEWS_TOPIC_PHOTOS } from "@/lib/editorial-news-topic-images";
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
      expect(html).toContain("tour-guide-");
      expect(html).toContain("Si Griffiths");
      expect(html).toContain("by-sa/3.0/deed.ko");
      expect(html).toContain("기사 현장 사진이 아닙니다");
    }
    expect(detail).toContain('"image":"https://www.keepioo.com/images/news/tour-guide.webp"');
  });
  it("상세의 해상도 선언은 실제 사진 크기와 일치한다", async () => {
    for (const url of EDITORIAL_PHOTO_URLS) {
      const actual = await sharp(`public${url}`).metadata();
      expect(actual.width).toBeGreaterThanOrEqual(640);
      for (const suffix of ["-480", "-640"]) {
        const variant = await sharp(`public${url.replace('.webp', `${suffix}.webp`)}`).metadata();
        expect(variant.width).toBe(Number(suffix.slice(1)));
      }
    }
    for (const photo of [...Object.values(NEWS_TOPIC_PHOTOS),
      getEditorialNewsPhoto(EDITORIAL_NEWS[0])!, getEditorialNewsPhoto({ slug: "finance", title: "신용 회복" })!]) {
      const actual = await sharp(`public${photo.url}`).metadata();
      expect({ width: photo.width, height: photo.height }).toEqual({ width: actual.width, height: actual.height });
    }
  });
  it("금융 제목과 기존 지정 사진을 구분하고 모든 크기 파일을 제공한다", () => {
    const finance = getEditorialNewsPhoto({ slug: "new-finance", title: "소상공인 대출 조건" });
    expect(finance?.url).toBe("/images/news/calculator.webp");
    expect(getEditorialNewsPhoto(EDITORIAL_NEWS[0])?.author).toBe("Ulrich Lange");
    for (const article of [automatic, EDITORIAL_NEWS[0], { slug: "finance", title: "신용 회복" }]) {
      const photo = getEditorialNewsPhoto(article)!;
      expect(safeNewsThumbnailUrl(photo.url)).toBe(photo.url);
      expect(safeNewsThumbnailUrl(photo.url, "external.example")).toBeNull();
      for (const suffix of ["", "-480", "-640"]) {
        expect(existsSync(`public${photo.url.replace(".webp", `${suffix}.webp`)}`)).toBe(true);
      }
    }
    expect(safeNewsThumbnailUrl("/images/news/unknown.webp")).toBeNull();
  });
  it("공개 기사 여섯 개에는 서로 다른 관련 사진을 지정한다", () => {
    const ids = ['148972905', '148972990', '148972997', '148973033', '148973136', '148973211'];
    const photos = ids.map(id => getEditorialNewsPhoto({ slug: `policy-brief-${id}`, title: '공식 기사' }));
    expect(new Set(photos.map(photo => photo?.url)).size).toBe(6);
    for (const photo of photos) {
      expect(photo?.caption).toContain('자료사진');
      expect(photo?.author).toBeTruthy();
      expect(photo?.sourceUrl).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/);
      expect(photo?.licenseUrl).toMatch(/^https:\/\//);
      expect(safeNewsThumbnailUrl(photo?.url)).toBe(photo?.url);
    }
  });
  it.each([
    ['코로나19 국가예방접종 안내', 'vaccination'], ['쉬운 우리말 사용 안내', 'hangul'],
    ['동물보호의 날 체험', 'dog'], ['청와대 사랑채 전시', 'sarangchae'],
    ['농촌 여행상품 확인', 'rural-trip'], ['관광산업 취업 지원', 'tour-guide'],
  ])("새 기사는 제목 주제에 맞는 자료사진을 고른다: %s", (title, file) => {
    expect(getEditorialNewsPhoto({ slug: '새-기사', title })?.url).toBe(`/images/news/${file}.webp`);
  });
  it("관련 사진이 없는 기사는 서울 사진으로 채우지 않는다", async () => {
    const unrelated = { ...automatic, slug: 'unknown-topic', title: '정책 전달 체계 개편 안내' };
    expect(getEditorialNewsPhoto(unrelated)).toBeNull();
    const card = renderToStaticMarkup(<EditorialNewsCards articles={[unrelated]} />);
    const detail = renderToStaticMarkup(await EditorialNewsDetail({ article: unrelated }));
    expect(card + detail).not.toContain('seoul-city');
    expect(detail).not.toContain('"image":');
    expect(detail).toContain('공식 기사에서 현장 사진 보기');
  });
  it("공식 사진 전용 기사는 별도 자료사진 표시 승인이 있을 때만 지정 사진을 쓴다", () => {
    expect(getEditorialNewsPhoto({ slug: 'unapproved-official', title: '관광 취업', photoPolicy: 'official-only' })).toBeNull();
    expect(getEditorialNewsPhoto({ ...automatic, photoPolicy: 'official-only' })?.url).toContain('tour-guide');
  });
});

it('코로나 피해 금융 기사는 백신 사진으로 분류하지 않는다', () => {
  expect(getEditorialNewsPhoto({ slug: 'covid-loan', title: '코로나 피해 소상공인 대출 신청 안내' })?.url).toBe('/images/news/calculator.webp');
});
