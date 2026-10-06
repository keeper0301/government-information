import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PolicyGuideBox } from '@/components/policy/PolicyGuideBox';
it('근거 없는 기존 설명과 거절 사유를 공개하지 않는다', () => {
  const html = renderToStaticMarkup(<PolicyGuideBox tips="소득증명서 필수" faq="서류 미비 탈락" checklist="등본 준비" />);
  expect(html).not.toContain('소득증명서 필수');
  expect(html).not.toContain('서류 미비 탈락');
  expect(html).toContain('검수');
});
