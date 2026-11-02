import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getEditorialNewsPhoto } from '@/lib/editorial-news-images';
import { safeNewsThumbnailUrl } from '@/lib/news-thumbnail';

const cases = [
  ['148974379', "전통공예품을 우리 집에! 'K-CRAFT, 일상이 되다'", 'korean-pottery'],
  ['148974473', "에스토니아의 신부 마이, '고결' 제1호 부부 됐다!", 'palace-museum'],
  ['148974454', '양육비 선지급제 소득기준 폐지', 'calculator'],
  ['148974391', "새싹을 지켜나가는 따스한 연결고리 '새싹지킴이병원'", 'child-blocks'],
];

describe('사진 부족으로 보류된 기사', () => {
  it.each(cases)('%s에 허가된 주제 사진과 실제 파일을 연결한다', async (id, title, file) => {
    const photo = getEditorialNewsPhoto({ slug: `policy-brief-${id}`, title });
    expect(photo?.url).toBe(`/images/news/${file}.webp`);
    expect(photo?.caption).toContain('자료사진');
    expect(safeNewsThumbnailUrl(photo!.url)).toBe(photo!.url);
    const metadata = await sharp(`public${photo!.url}`).metadata();
    expect([metadata.width, metadata.height]).toEqual([photo!.width, photo!.height]);
    for (const width of [480, 640]) {
      expect((await sharp(`public/images/news/${file}-${width}.webp`).metadata()).width).toBe(width);
    }
  });
  it.each(cases)('%s의 공식 사진 전용 조건을 유지한다', (id, title) => {
    expect(getEditorialNewsPhoto({ slug: `policy-brief-${id}`, title, photoPolicy: 'official-only' })).toBeNull();
  });
  it.each([
    ['전승공예품 전시 소개', 'korean-pottery'],
    ['국립고궁박물관 결혼식 안내', 'palace-museum'],
    ['양육비 선지급 신청 안내', 'calculator'],
    ['아동학대 전담의료기관 지원', 'child-blocks'],
  ])('새 기사의 제목으로도 주제 사진을 찾는다: %s', (title, file) => {
    const article = { slug: 'new-article', title };
    expect(getEditorialNewsPhoto(article)?.url).toBe(`/images/news/${file}.webp`);
    expect(getEditorialNewsPhoto({ ...article, photoPolicy: 'official-only' })).toBeNull();
  });
  it.each(['일반 결혼식 안내', '병원 시설 확충', '도자기 산업 수출'])('무관한 제목에는 배정하지 않는다: %s', title => {
    expect(getEditorialNewsPhoto({ slug: 'new-article', title })).toBeNull();
  });
  it('아동 보호 자료사진을 피해 아동이나 병원 현장으로 설명하지 않는다', () => {
    const photo = getEditorialNewsPhoto({ slug: 'new-article', title: '아동학대 전담의료기관 지원' });
    expect(photo?.caption).toContain('병원 현장이나 피해 아동을 촬영한 사진이 아닙니다');
  });
});
