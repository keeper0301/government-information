import type { EditorialNewsPhoto } from './editorial-news-images';

// 현장 사진과 구분해 표시하는 허가된 자료사진입니다. 크기·형식 변경본에도 원본 이용 조건을 적용합니다.
export const NEWS_PLACE_PHOTOS: Record<string, EditorialNewsPhoto> = {
  dongnae: {
    url: '/images/news/dongnae.webp', width: 1200, height: 900,
    alt: '동래온천 거리 — 2018년 자료사진', caption: '동래온천 거리 · 2018년 자료사진',
    author: 'Abasaa', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dongnae_Hot_Spring_01.JPG',
    licenseName: '저작자가 제한 없이 이용 허락',
    licenseUrl: 'https://commons.wikimedia.org/wiki/File:Dongnae_Hot_Spring_01.JPG#Licensing',
  },
  gongsanseong: {
    url: '/images/news/gongsanseong.webp', width: 1200, height: 676,
    alt: '공주 공산성 공산정 — 2021년 자료사진', caption: '공주 공산성 공산정 · 2021년 자료사진',
    author: 'Ashy Minivet', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gongsanjeong_Pavilion_of_Gongsanseong_Fortress.jpg',
    licenseName: '저작자가 제한 없이 이용 허락 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ko',
  },
  hipass: {
    url: '/images/news/hipass.webp', width: 1200, height: 900,
    alt: '경부고속도로 서울요금소 하이패스 차로 — 2009년 자료사진', caption: '서울요금소 하이패스 차로 · 2009년 자료사진',
    author: 'P.Cps1120a', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gyeongbu_Expresway_-_Seoul_TG_Hipass_Lane.jpg',
    licenseName: '저작자 표시·동일조건 변경 허락 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.ko',
  },
};
