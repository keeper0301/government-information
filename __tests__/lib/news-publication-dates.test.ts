import { expect, it } from 'vitest';
import { newsDraftIssue } from '@/lib/news-publication/validation';

const source = '기관은 교육 협력 내용을 발표했습니다. 발표 자료에는 2026.10.8.에 협약을 개정했다는 설명이 있습니다.';
const draft = (date = '2026년 10월 8일') => ({
  kind: 'change', title: '교육 협력 개정 내용과 적용 범위',
  question: '교육 협력의 개정 내용은 어떻게 읽어야 하나요?',
  answer: `협약 개정 날짜는 ${date}입니다. 개정 사실과 개별 프로그램의 신청 시작은 구분해야 합니다.`,
  audience: '교육 협력에 관심 있는 독자',
  sections: [
    { heading: '협약의 개정 사실', quote: '기관은 교육 협력 내용을 발표했습니다.', paragraphs: [
      '교육 협력의 방향을 정한 협약과 개인이 신청하는 프로그램은 서로 다릅니다. 협약 개정 사실만으로 새로운 장학금 접수가 시작됐다고 판단할 수는 없습니다. 실제 신청은 해당 사업의 안내를 따로 읽어야 합니다.'] },
    { heading: '지원 내용의 확인 범위', quote: '협약을 개정했다는 설명이 있습니다.', paragraphs: [
      '원문에서 발표한 협력 내용과 독자가 사용할 수 있는 지원은 나누어 살펴볼 필요가 있습니다. 이 글은 발표에 없는 자격이나 지원 금액을 새로 만들지 않으며, 협약의 의미를 개별 신청 조건으로 확대하지 않습니다.'] },
    { heading: '키피오의 해설', quote: '기관은 교육 협력 내용을 발표했습니다.', paragraphs: [
      '협력 발표를 읽을 때는 기관의 합의와 실제 모집 안내를 구별하면 도움이 됩니다. 키피오의 제안: 자신에게 해당하는 프로그램의 공고가 있는지 살펴보고, 공고에 없는 일정은 추측하지 않는 것이 좋습니다.'] },
  ],
});

it('원문의 점으로 구분한 날짜와 정확히 같은 한국어 날짜는 숫자 검사에서 인정한다', () => {
  const value = draft();
  const original = JSON.stringify(value);
  expect(newsDraftIssue(value, source)).toBeNull();
  expect(JSON.stringify(value)).toBe(original);
});

it('원문 날짜의 앞자리 영과 공백은 같은 달력 날짜로 비교한다', () => {
  expect(newsDraftIssue(draft(), source.replace('2026.10.8.', '2026. 10. 08.'))).toBeNull();
});

it('정확한 날짜가 있어도 독립된 월 안내를 추가로 허용하지 않는다', () => {
  const value = draft();
  value.answer += ' 10월 안내를 추가합니다.';
  expect(newsDraftIssue(value, source)).toContain('확인하지 못한 숫자: 10월');
});

it('제목의 연도와 질문의 월·일을 하나의 날짜로 합쳐서 허용하지 않는다', () => {
  const value = draft();
  value.title = '교육 협력 개정 2026년';
  value.question = '10월 8일에 무엇이 달라지나요?';
  expect(newsDraftIssue(value, source)).toContain('확인하지 못한 숫자');
});

it.each(['2026년 10월 9일', '2026년 11월 8일', '2027년 10월 8일', '10월 8일'])
('다른 날짜나 연도를 생략한 날짜는 원문의 날짜로 추측하지 않는다: %s', date => {
  expect(newsDraftIssue(draft(date), source)).toContain('확인하지 못한 숫자');
});

it('발표일만으로 원문에 없는 월과 일을 새로 허용하지 않는다', () => {
  expect(newsDraftIssue(draft(), source.replace('2026.10.8.', '발표 당일'), '2026-10-08'))
    .toContain('확인하지 못한 숫자');
});

it.each(['2026.2.30.', '2026.13.8.', '2026.10.8.1'])('잘못된 달력 날짜나 버전 번호를 날짜 근거로 삼지 않는다: %s', notation => {
  const date = notation.startsWith('2026.2') ? '2026년 2월 30일'
    : notation.startsWith('2026.13') ? '2026년 13월 8일' : '2026년 10월 8일';
  expect(newsDraftIssue(draft(date), source.replace('2026.10.8.', notation))).toContain('확인하지 못한 숫자');
});

it.each(['2026.10.8', 'v2026.10.8', '버전 2026.10.8.', 'version: 2026.10.8.', '- 2026.10.8.', '+2026.10.8.'])
('원문의 불완전한 날짜나 버전 표시·부호를 날짜 근거로 바꾸지 않는다: %s', notation => {
  expect(newsDraftIssue(draft(), source.replace('2026.10.8.', notation))).toContain('확인하지 못한 숫자');
});

it.each(['-2026년 10월 8일', '+ 2026년 10월 8일', '2026년 10월 8일차'])
('부호나 순번이 붙은 초안 표현을 같은 날짜로 인정하지 않는다: %s', date => {
  expect(newsDraftIssue(draft(date), source)).toContain('확인하지 못한 숫자');
});
