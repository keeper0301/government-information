import { expect, it } from 'vitest';
import { analyzeGuideHtml, parseArgs } from '../../tools/guide-quality-audit.mjs';
it('기본 검사에 글 30개와 글자 수 2400자를 승인 필수 조건으로 두지 않는다', () => {
  expect(parseArgs([])).toMatchObject({ minGuides: 1, minTextLength: 0 });
});
it('모든 글에 중복 수급 내용을 강제로 요구하지 않는다', () => {
  const result = analyzeGuideHtml('<h1>신청 전 대상 기준 확인</h1><p>공식 공고의 서류와 마감 기간을 확인하세요.</p>', 'https://www.keepioo.com/guides/example');
  expect(result.missing).not.toContain('duplicate_limits');
  expect(result.missing).not.toContain('content_depth');
});
