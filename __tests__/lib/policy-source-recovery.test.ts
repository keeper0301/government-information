import { describe, expect, it } from 'vitest';
import { resolveApplyUrl } from '@/lib/press-ingest/url-fallback';
import { buildWelfareInsertPayload } from '@/lib/press-ingest/candidates';

describe('정책 원문 보존과 신청 주소 분리', () => {
  it('고성군 신청처가 없을 때 강원도청 홈페이지를 신청처로 채우지 않는다', () => {
    const result = resolveApplyUrl({ llmApplyUrl: null, bodyUrls: [], body: '',
      ministry: '강원특별자치도 고성군', sourceUrl: 'https://www.keepioo.com/news/example' });
    expect(result.source).toBe('source_url');
  });
  it('기관 첫 화면은 본문에 있어도 신청처로 채우지 않는다', () => {
    const result = resolveApplyUrl({ llmApplyUrl: 'https://www.gangwon.go.kr',
      bodyUrls: ['https://www.gangwon.go.kr'], body: '', ministry: '강원특별자치도',
      sourceUrl: 'https://www.keepioo.com/news/example' });
    expect(result.source).toBe('source_url');
  });
  it('정책 등록에 수집한 실제 원문 주소를 보존한다', () => {
    const candidate = { id: 'candidate', news_id: 'news', status: 'pending',
      program_type: 'welfare', title: '청년 주거 지원', category: '주거',
      classified_payload: { title: '청년 주거 지원', apply_url: 'https://www.gwgs.go.kr/apply?id=123', region_tags: [],
        occupation_tags: [], benefit_tags: [], age_tags: [], household_tags: [] },
      news: { id: 'news', ministry: '강원특별자치도 고성군', slug: 'example',
        source_url: 'https://www.gwgs.go.kr/notice?id=123' } };
    const payload = buildWelfareInsertPayload(candidate as never);
    expect(payload.source_url).toBe(candidate.news.source_url);
  });
});
