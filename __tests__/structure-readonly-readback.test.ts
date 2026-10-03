import { describe, expect, it } from 'vitest';
import { READBACK_ROUTES, analyzePublicResponse, validateReadbackBase } from '@/tools/structure-readonly-readback.mjs';
const html = '<main><h1>서류 확인</h1><a href="https://www.gov.kr/service/official">공식 안내</a><section aria-label="출처와 확인 범위"></section></main><link rel="canonical" href="https://www.keepioo.com/guides/example"><meta name="robots" content="index, follow">';
const response = { status: 200, headers: {}, html, finalUrl: 'https://www.keepioo.com/guides/example' };
describe('read-only public verification evidence', () => {
  it('collects the exact planned route count without duplicates', () => { expect(READBACK_ROUTES).toHaveLength(20); expect(new Set(READBACK_ROUTES).size).toBe(20); });
  it('refuses arbitrary domains and origin credentials', () => {
    for (const url of ['https://evil.example', 'https://www.keepioo.com/api/admin', 'https://user:pass@www.keepioo.com', 'https://www.keepioo.com/?apply=true']) expect(() => validateReadbackBase(url)).toThrow();
    expect(validateReadbackBase('https://www.keepioo.com')).toBe('https://www.keepioo.com');
  });
  it('proves a single H1, canonical, source and evidence panel', () => {
    const row = analyzePublicResponse('/guides/example', response);
    expect(row.issues).toEqual([]); expect(row.sourceLinks).toEqual(['https://www.gov.kr/service/official']); expect(row.evidencePanel).toBe(true);
  });
  it('flags missing source, header noindex, fake 200 missing page and invalid dates', () => {
    const row = analyzePublicResponse('/guides/example', { ...response, headers: { 'x-robots-tag': 'noindex' }, html: html.replace('https://www.gov.kr/service/official', '/guides').replace('서류 확인', 'Invalid Date') });
    expect(row.issues).toContain('no_direct_external_source_link'); expect(row.issues).toContain('public_noindex'); expect(row.issues).toContain('invalid_date_rendered');
    expect(analyzePublicResponse('/guides/no-such-guide-structure-readback', response).issues).toContain('unexpected_http_status');
    expect(analyzePublicResponse('/guides/no-such-guide-structure-readback', { ...response, status: 404 }).issues).toEqual([]);
  });
});
