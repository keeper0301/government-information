import { expect, it } from 'vitest';
import { classifyEditorialNews } from '@/lib/news-publication/classification';
import { getEditorialNewsPhoto } from '@/lib/editorial-news-images';

// 실제 수집 본문에서는 가운데점이 공백으로 정리되므로 두 형태를 모두 확인합니다.
it.each(['·', ' '])('궁중문화축전 장소 구분자 %s에서도 원문 근거를 보존한다', separator => {
  const body = `4대 궁(경복궁${separator}창덕궁${separator}덕수궁${separator}창경궁)과 종묘에서 열리는 축전입니다.`;
  const result = classifyEditorialNews('가을 궁중문화축전 현장 일정 종료', body);
  expect(result.regions).toEqual(['seoul']);
  expect(body).toContain(result.regionEvidence);
});

it('궁궐 이름이 없는 기사에 서울 지역을 추정하지 않는다', () => {
  expect(classifyEditorialNews('궁중문화축전 소개', '온라인 행사입니다.').regions).toEqual(['unclassified']);
});

it.each([
  ['148973473', '재개발·재건축 점검 일정', 'housing-apartments'],
  ['148973064', '전세사기 최소보장제', 'housing-apartments'],
  ['148973168', '청년미래적금 2차 접수 종료', 'calculator'],
])('기존 기사 %s에 허가된 주제 자료사진과 출처를 제공한다', (id, title, file) => {
  const photo = getEditorialNewsPhoto({ slug: `policy-brief-${id}`, title });
  expect(photo?.url).toBe(`/images/news/${file}.webp`);
  expect(photo?.caption).toContain('자료사진');
  expect(photo?.author).toBeTruthy();
  expect(photo?.sourceUrl).toMatch(/^https:\/\//);
  expect(photo?.licenseUrl).toMatch(/^https:\/\//);
});
