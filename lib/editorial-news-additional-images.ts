import type { EditorialNewsPhoto } from './editorial-news-images';
import { NEWS_FAMILY_PHOTOS } from './editorial-news-family-images';

// 행사 현장과 구분하며, 원본의 이용 조건을 변경본에도 적용합니다.
export const NEWS_ADDITIONAL_PHOTOS: Record<string, EditorialNewsPhoto> = {
  pottery: {
    url: '/images/news/korean-pottery.webp', width: 1200, height: 900,
    alt: '국립중앙박물관에 전시된 한국 도자기 자료사진',
    caption: '한국 도자기 · 2006년 자료사진 · 이번 팝업스토어 출품작이 아닙니다 · 크기·형식 변경',
    author: 'tjfriese',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Korean_pottery-01.jpg',
    licenseName: '저작자 표시·동일조건 변경 허락 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/deed.ko',
  },
  museum: {
    url: '/images/news/palace-museum.webp', width: 1200, height: 717,
    alt: '국립고궁박물관 입구 자료사진',
    caption: '국립고궁박물관 · 2024년 자료사진 · 기사 속 결혼식이나 부부를 촬영한 사진이 아닙니다 · 크기·형식 변경',
    author: 'Mobius6',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:National_Palace_Museum_of_Korea_20240409_004.jpg',
    licenseName: '저작자 표시 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ko',
  },
  childProtection: {
    ...NEWS_FAMILY_PHOTOS.childcare,
    caption: '유아 학습용 블록 · 2010년 자료사진 · 병원 현장이나 피해 아동을 촬영한 사진이 아닙니다',
  },
};
