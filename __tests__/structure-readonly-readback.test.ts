import { describe, expect, it, vi } from 'vitest';
import { READBACK_ROUTES, analyzePublicResponse, validateReadbackBase, fetchReadbackRoute, EXPECTED_PILOT_SOURCES } from '@/tools/structure-readonly-readback.mjs';
const html = '<main><h1>서류 확인</h1><section aria-label="출처와 확인 범위"><a href="https://www.gov.kr/service/official">공식 안내</a></section></main><link rel="canonical" href="https://www.keepioo.com/guides/example"><meta name="robots" content="index, follow">';
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
  it('requires the precise official links inside a unique pilot evidence panel', () => {
    const route = '/guides/documents-before-government-benefit';
    const valid = html.replace('/guides/example', route).replace('https://www.gov.kr/service/official', EXPECTED_PILOT_SOURCES[route][0]);
    expect(analyzePublicResponse(route, { ...response, html: valid }).issues).toEqual([]);
    for (const fake of ['https://attacker.example/fake', 'https://www.gov.kr@attacker.example/fake', 'https://evilkeepioo.com/fake']) {
      expect(analyzePublicResponse(route, { ...response, html: valid.replace(EXPECTED_PILOT_SOURCES[route][0], fake) }).issues).toContain('expected_official_source_missing');
    }
    expect(analyzePublicResponse(route, { ...response, html: valid.replace('aria-label="출처와 확인 범위"', '') }).issues).toContain('evidence_panel_missing_or_ambiguous');
  });
  it('refuses external, credentialed and out-of-route redirect destinations before requesting them', async () => {
    for (const location of ['https://outside.example/', 'https://user:pass@www.keepioo.com/', '/api/admin', '/?apply=true']) {
      const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
        expect(String(url)).toBe('https://www.keepioo.com/');
        expect(options?.redirect).toBe('manual');
        return new Response(null, { status: 302, headers: { location } });
      });
      await expect(fetchReadbackRoute('https://www.keepioo.com', '/', fetcher)).rejects.toThrow('before request');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    }
  });
  it('allows in-scope redirect and bounds loops and streamed response bytes', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/about' } })).mockResolvedValueOnce(new Response('ok'));
    expect((await fetchReadbackRoute('https://www.keepioo.com', '/', fetcher)).html).toBe('ok');
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/' } }));
    await expect(fetchReadbackRoute('https://www.keepioo.com', '/', loop)).rejects.toThrow('hop limit');
    expect(loop).toHaveBeenCalledTimes(6);
    await expect(fetchReadbackRoute('https://www.keepioo.com', '/', async () => new Response('too big'), 2)).rejects.toThrow('size limit');
  });
});
