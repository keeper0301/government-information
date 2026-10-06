import { describe, expect, it } from 'vitest';
import { applicationCorrection, sourceCorrection } from '@/lib/policy/source-correction';

describe('원문 주소 수정 조건', () => {
  it('공식 공고 주소를 허용하고 이전 승인을 무효화한다', () => {
    const result = sourceCorrection('https://www.gwgs.go.kr/notice?id=123', true);
    expect(result).toEqual({ url: 'https://www.gwgs.go.kr/notice?id=123', guidance: { version: 1, status: 'needs_source' } });
  });
  it.each(['https://www.gwgs.go.kr/', 'https://www.gwgs.go.kr/?utm_source=x',
    'https://www.gwgs.go.kr/#section', 'https://news.example.com/story/1',
    'https://www.gwgs.go.kr.evil.com/notice?id=123', 'javascript:alert(1)',
    'https://user:secret@www.gwgs.go.kr/notice?id=123'])('잘못된 주소를 거절한다: %s', url => {
    expect(() => sourceCorrection(url, true)).toThrow();
  });
  it('사업·지역·연도를 확인하지 않으면 수정하지 않는다', () => {
    expect(() => sourceCorrection('https://www.gwgs.go.kr/notice?id=123', false)).toThrow();
  });
  it('신청 안내 주소도 첫 화면과 비보안 주소를 거절한다', () => {
    for (const value of ['https://www.gwgs.go.kr/', 'https://www.gwgs.go.kr/?utm_source=x',
      'https://www.gwgs.go.kr/#section', 'http://www.gwgs.go.kr/notice?id=1', 'https://x:y@www.gwgs.go.kr/notice?id=1']) {
      expect(() => applicationCorrection(value, true)).toThrow();
    }
    expect(applicationCorrection('https://www.gwgs.go.kr/notice?id=1', true).url).toContain('notice');
  });
});
