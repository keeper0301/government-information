import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorialNewsCards, EditorialNewsDetail } from '@/components/news/editorial-news-pages';
import correction from '@/docs/news-event-correction-20261007.json';
import type { EditorialNews } from '@/lib/editorial-news-data';

vi.mock('@/lib/policy-guides', () => ({ getGuides: async () => [] }));
const article = correction.article as EditorialNews;

it('원문 참가 사례·가명 출처·직무별 질문을 뉴스 상세에 함께 표시한다', async () => {
  const html = renderToStaticMarkup(await EditorialNewsDetail({ article }));
  for (const text of ['54세', '51세', '가명', '직접 인터뷰한 사례는 아닙니다',
    '소개된 직무와 상담 질문 예시', '필요한 자격', '문의만 가능']) expect(html).toContain(text);
  expect(html).toContain('<table');
  expect(html).toContain('scope="row"');
  expect(article.sections.find(section => section.table)?.table?.rows).toHaveLength(5);
});

it('공식 사진만 요청한 글에는 무관한 자료사진과 잘못된 사진 검색 정보가 나오지 않는다', async () => {
  const detail = renderToStaticMarkup(await EditorialNewsDetail({ article }));
  const card = renderToStaticMarkup(<EditorialNewsCards articles={[article]} />);
  for (const html of [detail, card]) {
    expect(html).not.toContain('seoul-city');
    expect(html).not.toContain('BI3QWQ');
    expect(html).not.toContain('"image":');
  }
  expect(detail).toContain('공식 기사에서 현장 사진 보기');
  expect(detail).toContain(article.sourceUrl.replace(/&/g, '&amp;'));
});
