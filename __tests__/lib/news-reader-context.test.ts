import { describe, expect, it } from 'vitest';
import { relatedNewsGuide, officialNewsActions } from '@/lib/news-publication/reader-context';
import { getNewsStatus } from '@/lib/editorial-news-status';

describe('뉴스 독자의 다음 행동과 일정', () => {
  it('신청 주제에만 가이드를 연결하고 여행 기사에 일반 서류 안내를 붙이지 않는다', () => {
    expect(relatedNewsGuide('어린이집 신학기 신청')).toBe('documents-before-government-benefit');
    expect(relatedNewsGuide('공주 공산성 여행')).toBe('');
  });
  it('원문에 정확한 공식 주소가 있는 경우만 연결한다', () => {
    expect(officialNewsActions('유치원 신청', 'www.childinfo.go.kr에서 신청', '2026-10-19')).toHaveLength(1);
    expect(officialNewsActions('유치원 신청', 'www.childinfo.go.kr.evil.test', '2026-10-19')).toHaveLength(0);
    expect(officialNewsActions('유치원 신청', '주소 미확인', '2026-10-19')).toHaveLength(0);
    expect(officialNewsActions('공연 소식', 'www.childinfo.go.kr', '2026-10-19')).toHaveLength(0);
  });
  it('예정일이 지나도 시행 중으로 바꾸지 않고 혼합 일정을 구분한다', () => {
    expect(getNewsStatus({ title: '10월 1일 시행 예정' }, '2026-10-19')).toBe('planned');
    expect(getNewsStatus({ title: '궁중문화축전 현장 종료…온라인 11월 1일까지' })).toBe('mixed');
    expect(getNewsStatus({ title: '축제 종료' })).toBe('ended');
    expect(getNewsStatus({ title: '덕수궁 ‘광무에서 융희까지’ 특별전 종료…사진·기록으로 읽은 대한제국' })).toBe('ended');
    expect(getNewsStatus({ title: '박물관 소식' })).toBe('information');
  });
  it('확인된 기간은 경계일과 연도 변경을 정확히 처리한다', () => {
    const article = { title: '전시 안내', schedule: { start: '2026-10-02', end: '2027-02-09', evidence: '2026년 10월 2일부터 2027년 2월 9일까지' } };
    expect(getNewsStatus(article, '2026-10-01')).toBe('planned');
    expect(getNewsStatus(article, '2026-10-02')).toBe('ongoing');
    expect(getNewsStatus(article, '2027-02-09')).toBe('ongoing');
    expect(getNewsStatus(article, '2027-02-10')).toBe('ended');
    expect(getNewsStatus({ ...article, schedule: { ...article.schedule, start: '2026-02-30' } })).toBe('information');
  });
});
