import { expect, it } from 'vitest';
import { isReviewedNewsPage } from '../../tools/reviewed-news-check.mjs';
const html = (text: string, robots = 'index, follow') => `<meta name="robots" content="${robots}"><main>${text}</main>`;
it('검수 뉴스가 있는 정상 색인 목록을 허용한다', () => {
  expect(isReviewedNewsPage('/news', html('공개된 검수 뉴스 3건'))).toBe(true);
});
it('검색 제외 목록과 빈 목록을 허용하지 않는다', () => {
  expect(isReviewedNewsPage('/news', html('공개된 검수 뉴스 3건', 'noindex, follow'))).toBe(false);
  expect(isReviewedNewsPage('/news', html('정책뉴스를 검수하고 있습니다'))).toBe(false);
});
it('상세는 실제 검수 표시와 색인 상태를 모두 요구한다', () => {
  expect(isReviewedNewsPage('/news/example', html('키피오 발행·검수일: 2026-10-06'))).toBe(true);
  expect(isReviewedNewsPage('/news/example', html('수집된 뉴스'))).toBe(false);
  expect(isReviewedNewsPage('/news/example', html('키피오 발행·검수일', 'noindex, follow'))).toBe(false);
});
it('스크립트 안의 검수 문구는 공개 표시로 인정하지 않는다', () => {
  expect(isReviewedNewsPage('/news', html('<script>공개된 검수 뉴스 3건</script>'))).toBe(false);
});
