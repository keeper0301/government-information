import { describe, expect, it } from 'vitest';
import { createGuideDraft, approveGuide, getPublishedGuide } from '@/lib/policy/evidence-guide';
const row = { title: '고성형 청년 월세', source_url: 'https://www.gwgs.go.kr/notice?id=123',
  description: '지원 대상은 고성군 거주 청년입니다.', updated_at: '2026-10-06' };
const source = { url: row.source_url, title: row.title,
  body: '고성형 청년 월세 지원 대상은 고성군 거주 청년입니다. 제출 서류는 임대차계약서입니다.',
  checkedAt: '2026-10-06T00:00:00.000Z' };
const sections = [{ label: '신청 전 확인', text: '거주 조건을 먼저 확인하세요.', quote: '고성군 거주 청년' }];
describe('근거와 사람 검수를 거친 해설만 공개', () => {
  it('초안은 공개하지 않고 승인 후에만 공개한다', () => {
    const draft = createGuideDraft(row, source, sections);
    expect(getPublishedGuide(row, draft)).toBeNull();
    const approved = approveGuide(row, draft, '관리자', new Date('2026-10-06T01:00:00Z'));
    expect(getPublishedGuide(row, approved)?.sections).toEqual(sections);
  });
  it('본문에 없는 근거는 초안을 만들 수 없다', () => {
    expect(() => createGuideDraft(row, source, [{ ...sections[0], quote: '소득증명서 필수' }])).toThrow();
  });
  it('자료나 해설이 바뀌면 기존 승인이 무효가 된다', () => {
    const approved = approveGuide(row, createGuideDraft(row, source, sections), '관리자', new Date('2026-10-06T01:00:00Z'));
    expect(getPublishedGuide({ ...row, description: '다른 회차' }, approved)).toBeNull();
    expect(getPublishedGuide(row, { ...approved, sections: [{ ...sections[0], text: '변경됨' }] })).toBeNull();
  });
  it('기관이나 지역 태그가 변경되면 기존 승인이 무효가 된다', () => {
    const original = { ...row, source: '고성군청', region_tags: ['강원특별자치도'] };
    const approved = approveGuide(original, createGuideDraft(original, source, sections), '관리자', new Date('2026-10-06T01:00:00Z'));
    expect(getPublishedGuide({ ...original, source: '경상남도 고성군청' }, approved)).toBeNull();
    expect(getPublishedGuide({ ...original, region_tags: ['경상남도'] }, approved)).toBeNull();
  });
  it('기관 홈과 키피오 내부 주소는 공고 근거로 승인할 수 없다', () => {
    for (const url of ['https://www.gangwon.go.kr', 'https://www.keepioo.com/news/example']) {
      expect(() => createGuideDraft({ ...row, source_url: url }, { ...source, url }, sections)).toThrow();
    }
  });
});
