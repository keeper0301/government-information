import type { EditorialNews } from "@/lib/editorial-news-data";
import { NEWS_TOPIC_PHOTOS } from './editorial-news-topic-images';

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

// 기사별로 확인한 자료사진을 우선합니다. 기존 승인 기사의 내용·검수 기록은 바꾸지 않습니다.
export const EDITORIAL_NEWS_IMAGES: Record<string, EditorialNewsPhoto> = {
  "onnuri-reform-shop-checklist-2026": market,
  'policy-brief-148972905': NEWS_TOPIC_PHOTOS.tourism,
  'policy-brief-148972990': NEWS_TOPIC_PHOTOS.language,
  'policy-brief-148972997': NEWS_TOPIC_PHOTOS.vaccination,
  'policy-brief-148973033': NEWS_TOPIC_PHOTOS.exhibition,
  'policy-brief-148973136': NEWS_TOPIC_PHOTOS.animal,
  'policy-brief-148973211': NEWS_TOPIC_PHOTOS.rural,
  'policy-brief-148973175': NEWS_TOPIC_PHOTOS.palace,
  'policy-brief-148973216': NEWS_TOPIC_PHOTOS.education,
  'policy-brief-148973020': NEWS_TOPIC_PHOTOS.gyeongju,
};
export const EDITORIAL_PHOTO_URLS = [market.url, city.url, calculator.url,
  ...Object.values(NEWS_TOPIC_PHOTOS).map(photo => photo.url)];
export function getEditorialNewsPhoto(article: Pick<EditorialNews, "slug" | "title" | "photoPolicy">): EditorialNewsPhoto | null {
  if (EDITORIAL_NEWS_IMAGES[article.slug]) return EDITORIAL_NEWS_IMAGES[article.slug];
  // 이번에 확인·승인한 지정 사진 외에는 기존 공식 사진 전용 조건을 지킵니다.
  if (article.photoPolicy === 'official-only') return null;
  if (/백신|예방접종/.test(article.title)) return NEWS_TOPIC_PHOTOS.vaccination;
  if (/우리말|한글|외래어|다듬은 말|국어/.test(article.title)) return NEWS_TOPIC_PHOTOS.language;
  if (/반려동물|반려견|유기견|동물보호|동물사랑/.test(article.title)) return NEWS_TOPIC_PHOTOS.animal;
  if (/청와대\s*사랑채/.test(article.title)) return NEWS_TOPIC_PHOTOS.exhibition;
  if (/농촌|농가|농업/.test(article.title)) return NEWS_TOPIC_PHOTOS.rural;
  if (/관광.*(?:취업|구직|일자리|커리어)/.test(article.title)) return NEWS_TOPIC_PHOTOS.tourism;
  if (/금융|신용|대출|세금|연금|보험|지원금/.test(article.title)) return calculator;
  if (/온누리|전통시장|소상공인|자영업|상권/.test(article.title)) return market;
  // 관련 자료사진이 없는 글에 서울 사진을 임의로 넣지 않습니다.
  return null;
}
