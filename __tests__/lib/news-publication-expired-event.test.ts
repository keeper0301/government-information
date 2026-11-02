import { expect, it } from 'vitest';
import { expiredEventIssue } from '@/lib/news-publication/expired-event';
import type { NewsDraft } from '@/lib/news-publication/validation';

const source = '팝업스토어 행사는 10월 24일부터 29일까지 연희정음에서 열린다.';
const draft = (text: string): NewsDraft => ({ kind: 'report', title: '공예품 전시 이야기',
  question: '어떤 공예품을 소개하나요?', answer: '전통공예품의 생활 속 쓰임을 소개합니다.', audience: '전통 공예에 관심 있는 시민',
  sections: [{ heading: '발표 당시 일정', quote: source, paragraphs: [text] }] });

it.each(['팝업스토어가 운영된다.', '시민 누구나 무료로 입장할 수 있다.', '행사가 진행됩니다.'])(
  '지난 행사 기간의 현재 안내를 보류한다: %s', text => {
    expect(expiredEventIssue(draft(text), source, '2026-10-28', '2026-11-01')).toContain('2026-10-29');
  });
it.each(['2026-10-28', '2026-10-29'])('행사 당일과 이전에는 종료로 판단하지 않는다: %s', date => {
  expect(expiredEventIssue(draft('무료로 입장할 수 있다.'), source, '2026-10-28', date)).toBeNull();
});
it.each(['발표 당시 10월 24일부터 29일까지 운영한다고 안내했다.', '공예품의 다양한 쓰임을 소개한다.'])(
  '과거 일정 소개와 작품 설명은 허용한다: %s', text => {
    expect(expiredEventIssue(draft(text), source, '2026-10-28', '2026-11-01')).toBeNull();
  });
it('다른 문장의 과거 안내가 현재 입장 안내를 덮지 않는다', () => {
  expect(expiredEventIssue(draft('당시 일정을 안내했다. 무료로 입장할 수 있다.'), source, '2026-10-28', '2026-11-01')).not.toBeNull();
});
it('같은 문장의 과거 안내 뒤 현재 입장 주장을 붙여도 보류한다', () => {
  expect(expiredEventIssue(draft('당시 무료 입장을 안내했으며 현재 무료로 입장할 수 있다.'), source, '2026-10-28', '2026-11-01')).not.toBeNull();
});
it('날짜 없는 다른 행사 문단에 종료 판단을 전파하지 않는다', () => {
  const value = draft('당시 일정을 안내했다.');
  value.sections.push({ heading: '별도 행사', quote: '다른 행사는 상시 열린다.', paragraphs: ['다른 행사는 운영된다.'] });
  expect(expiredEventIssue(value, source, '2026-10-28', '2026-11-01')).toBeNull();
});
it('원문과 다른 기간이나 알 수 없는 연도는 추정하지 않는다', () => {
  expect(expiredEventIssue(draft('무료로 입장할 수 있다.'), source, undefined, '2026-11-01')).toBeNull();
  expect(expiredEventIssue(draft('무료로 입장할 수 있다.'), '다른 일정만 존재한다.', '2026-10-28', '2026-11-01')).toBeNull();
});
it('다른 연도를 뜻하는 생략 날짜와 잘못된 달력 날짜는 추정하지 않는다', () => {
  for (const quote of ['지난해 행사는 10월 24일부터 29일까지 열린다.', '행사는 2월 24일부터 30일까지 열린다.']) {
    const value = draft('무료로 입장할 수 있다.');
    value.sections[0].quote = quote;
    expect(expiredEventIssue(value, quote, '2026-10-28', '2026-11-01')).toBeNull();
  }
});
it('같은 행사 근거로 작성한 날짜 없는 요약의 현재 안내를 보류한다', () => {
  const value = draft('발표 당시 일정으로 소개했다.');
  value.answer = '이 전시는 무료로 입장할 수 있다.';
  expect(expiredEventIssue(value, source, '2026-10-28', '2026-11-01')).toContain('2026-10-29');
});
it('점 표기 일정도 검수에 연결한다', () => {
  const quote = '창덕궁 전시 기간은 9.22.~11.8.이다.';
  const value = draft('전시가 운영된다.');
  value.sections[0].quote = quote;
  expect(expiredEventIssue(value, quote, '2026-10-28', '2026-11-09')).toContain('2026-11-08');
  expect(expiredEventIssue(value, quote, '2026-10-28', '2026-11-02')).toBeNull();
});
it('현재 운영 주장의 부정은 허용하지만 별도 긍정 주장은 차단한다', () => {
  expect(expiredEventIssue(draft('현재 운영 중이라는 뜻은 아닙니다.'), source, '2026-10-28', '2026-11-01')).toBeNull();
  expect(expiredEventIssue(draft('현재 운영 중이라는 뜻은 아니며 무료로 입장할 수 있다.'), source, '2026-10-28', '2026-11-01')).not.toBeNull();
});
