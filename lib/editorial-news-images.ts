import type { EditorialNews } from "@/lib/editorial-news-data";

export type EditorialNewsPhoto = {
  url: string; alt: string; caption: string; author: string; sourceUrl: string;
  licenseName: string; licenseUrl: string; width: number; height: number;
};

// 기사 사실과 구분되는 자료사진입니다. 사용·변경 허가를 확인한 사진만 등록합니다.
const market: EditorialNewsPhoto = {
  url: "/images/news/jeongeup-market.webp", width: 1200, height: 900,
  alt: "정읍 전통시장의 상점과 장을 보는 사람들 — 2011년 자료사진",
  caption: "정읍 전통시장 · 2011년 자료사진",
  author: "Ulrich Lange",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Traditional_Market_at_Jeongup_1.jpg",
  licenseName: "저작자 표시·동일조건 변경 허락 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/deed.ko",
};
const city: EditorialNewsPhoto = {
  url: "/images/news/seoul-city.webp", width: 1280, height: 438,
  alt: "남산에서 바라본 서울 도심 전경 — 2026년 자료사진",
  caption: "서울 도심 전경 · 2026년 자료사진",
  author: "BI3QWQ",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Panoramic_view_of_Seoul,_South_Korea.jpg",
  licenseName: "저작자 표시·동일조건 변경 허락 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.ko",
};
const calculator: EditorialNewsPhoto = {
  url: "/images/news/calculator.webp", width: 1024, height: 765,
  alt: "계산기와 펜, 수학 메모 — 2011년 자료사진",
  caption: "계산기와 메모 · 2011년 자료사진",
  author: "Smorgasbord",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Math_answers_with_a_pen_and_calculator.jpg",
  licenseName: "저작자 표시·동일조건 변경 허락 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/deed.ko",
};

// 기존 지정 사진을 유지하고 새 자동 글은 제목의 주제에 맞춰 선택합니다.
export const EDITORIAL_NEWS_IMAGES: Record<string, EditorialNewsPhoto> = {
  "onnuri-reform-shop-checklist-2026": market,
};
export const EDITORIAL_PHOTO_URLS = [market.url, city.url, calculator.url];
export function getEditorialNewsPhoto(article: Pick<EditorialNews, "slug" | "title">): EditorialNewsPhoto {
  if (EDITORIAL_NEWS_IMAGES[article.slug]) return EDITORIAL_NEWS_IMAGES[article.slug];
  if (/금융|신용|대출|세금|연금|보험|지원금/.test(article.title)) return calculator;
  if (/온누리|전통시장|소상공인|자영업|상권/.test(article.title)) return market;
  return city;
}
