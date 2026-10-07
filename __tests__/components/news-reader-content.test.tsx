import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EligibilityDemoStrip } from '@/components/eligibility-demo-strip';
import { EditorialNewsDetail } from '@/components/news/editorial-news-pages';
import { verifiedAdditionalSources } from '@/components/news/editorial-news-sources';
import correction from '@/docs/news-reader-correction-20261007.json';
import type { EditorialNews } from '@/lib/editorial-news-data';

vi.mock('@/lib/policy-guides', () => ({ getGuides: async () => [] }));
const article = correction.article as EditorialNews;

it('자격 진단 소개는 독자의 이용 설명을 제공하고 내부 심사 목적은 노출하지 않는다', () => {
  const html = renderToStaticMarkup(<EligibilityDemoStrip />);
  expect(html).not.toMatch(/검수자가|서비스 목적이 바로 드러/);
  expect(html).toContain('신청 준비 사항');
});

it('보강한 기사는 구체적인 상담 정보와 별도 출처를 실제 상세 화면에 표시한다', async () => {
  const html = renderToStaticMarkup(await EditorialNewsDetail({ article }));
  for (const text of ['무료', '사전 예약', '약 30분', '최대 3회', '02-6410-0163', '문의만 가능', '회원 가입']) {
    expect(html).toContain(text);
  }
  expect(html).toContain(article.additionalSources![0].url);
  expect(html).toContain('보충 근거');
  expect(html).toContain('사람의 검수와 다르며');
  expect(html).not.toContain('해석하지 마세요');
  expect(html).toContain('"citation":[');
});

it('가짜 기관 주소·실행 주소·인증 정보가 있는 보충 링크는 표시하지 않는다', () => {
  for (const url of ['javascript:alert(1)', 'https://academy.visitkorea.or.kr.evil.com',
    'https://user:password@academy.visitkorea.or.kr', 'http://academy.visitkorea.or.kr']) {
    expect(verifiedAdditionalSources({ ...article, additionalSources: [{ ...article.additionalSources![0], url }] })).toEqual([]);
  }
});
