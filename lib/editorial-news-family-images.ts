import type { EditorialNewsPhoto } from './editorial-news-images';

// 공고 현장이 아닌 자료사진입니다. 원본 출처와 변경본 이용 조건을 함께 표시합니다.
export const NEWS_FAMILY_PHOTOS: Record<string, EditorialNewsPhoto> = {
  childcare: {
    url: '/images/news/child-blocks.webp', width: 1200, height: 900,
    alt: '유아 학습용 나무 블록 자료사진',
    caption: '유아 학습용 블록 · 2010년 자료사진 · 해당 어린이집·유치원 사진이 아닙니다',
    author: 'Bobjgalindo', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A_pile_of_alphabet_wooden_blocks.jpg',
    licenseName: '저작자 표시 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ko',
  },
  housing: {
    url: '/images/news/housing-apartments.webp', width: 1200, height: 1284,
    alt: '부산 엄궁동 아파트 자료사진',
    caption: '부산 엄궁동 아파트 · 2008년 자료사진 · 기사에서 모집하는 주택이나 지역을 뜻하지 않습니다',
    author: 'Samuel Orchard · 원본 편집 Radiant Urbanism',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Apartment_blocks_in_Eomgung-dong_of_Busan,_Korea-01.jpg',
    licenseName: '저작자 표시·동일조건 변경 허락 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/deed.ko',
  },
};
