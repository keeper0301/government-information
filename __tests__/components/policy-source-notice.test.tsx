import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SparseDataNotice } from '@/components/sparse-data-notice';
it('기관 홈과 내부 뉴스를 해당 공고 원문이라고 안내하지 않는다', () => {
  for (const sourceLink of ['https://www.gangwon.go.kr', 'https://www.keepioo.com/news/example']) {
    const html = renderToStaticMarkup(<SparseDataNotice source="고성군청" sourceLink={sourceLink} variant="sparse" />);
    expect(html).not.toContain('원문 페이지 열기');
    expect(html).not.toContain('세부 내용은 원문 페이지에 있어요');
  }
});
