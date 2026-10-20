import { expect, it } from 'vitest';
import { sourceStateIssue } from '@/lib/news-publication/source-state';
import type { NewsDraft } from '@/lib/news-publication/validation';

const body = '21일 한복문화주간 개막 기념행사를 개최한다. 유공자에게 표창을 수여한다. 김윤아의 공연과 한복 브랜드가 참여할 예정이다.';
const draft = (text: string): NewsDraft => ({ kind: 'report', title: '한복문화주간 행사 안내',
  question: '어떤 프로그램이 있나요?', answer: '21일 기념행사가 열릴 예정입니다.', audience: '한복에 관심 있는 시민',
  sections: [{ heading: '개막 행사 안내', paragraphs: [text], quote: body }] });

it.each(['21일 기념행사가 열렸다.', '개막 기념행사를 개최했습니다.', '장관 표창이 수여되었다.',
  '유공자가 표창을 받았다.', '한복 브랜드가 참여했다.', '김윤아가 무대를 시작했다.'])('예정 행사의 완료 단정을 차단: %s', text => {
  expect(sourceStateIssue(draft(text), body)).not.toBeNull();
});
it.each(['21일 기념행사가 열릴 예정이다.', '장관 표창을 수여한다고 발표했다.',
  '기념행사가 열렸다는 뜻은 아닙니다.'])('예정·발표·직접 부정은 허용: %s', text => {
  expect(sourceStateIssue(draft(text), body)).toBeNull();
});
it('다른 문장의 예정 안내가 완료 단정을 덮지 않는다', () => {
  expect(sourceStateIssue(draft('기념행사가 열렸다. 다른 체험은 열릴 예정이다.'), body)).not.toBeNull();
});
it('실제 완료를 알리는 원문은 허용한다', () => {
  expect(sourceStateIssue(draft('8일 기념행사가 개최됐습니다.'), '8일 임산부 기념행사를 개최했다.')).toBeNull();
});
it('날짜가 지나도 원문에 없는 완료를 추정하지 않는다', () => {
  expect(sourceStateIssue(draft('지난 8일 행사를 개최했다.'), '8일 행사를 개최할 계획이다.')).not.toBeNull();
});
it('제목의 완료 표현도 검사한다', () => {
  const value = draft('개막식은 개최 예정이다.');
  value.title = '한복문화주간 개막행사가 열렸다';
  expect(sourceStateIssue(value, body)).not.toBeNull();
});
it.each(['개최된다', '개최됩니다', '열린다'])('일반 예고 어미도 인식한다: %s', ending => {
  expect(sourceStateIssue(draft('기념행사를 21일 열었다.'), `기념행사는 21일 ${ending}.`)).not.toBeNull();
});
it('별개 예정 행사 때문에 확인된 완료 행사의 어순 변경을 차단하지 않는다', () => {
  const source = '지난 8일 서울에서 임산부의 날 기념행사가 열렸다. 다음 주에는 지역 축제를 개최한다.';
  expect(sourceStateIssue(draft('임산부의 날 기념행사는 8일 서울에서 열렸다.'), source)).toBeNull();
  expect(sourceStateIssue(draft('한복문화주간 기념행사는 8일 서울에서 열렸다.'), source)).not.toBeNull();
});
it('날짜와 장소가 같아도 다른 종류 행사의 완료 사실을 빌리지 않는다', () => {
  const source = '21일 서울 경복궁에서 전시가 열렸다. 21일 서울 경복궁에서 기념행사가 열린다.';
  expect(sourceStateIssue(draft('21일 서울 경복궁에서 기념행사가 열렸다.'), source)).not.toBeNull();
  expect(sourceStateIssue(draft('서울 경복궁에서 21일 전시가 열렸다.'), source)).toBeNull();
});
it.each([
  ['오는 21일 한복문화주간 개막식을 연다.', '한복문화주간 개막식을 열었다.'],
  ['문화주간은 21일 개막한다.', '문화주간은 21일 개막했다.'],
  ['공연은 오는 21일 개최된다.', '공연이 21일 진행됐다.'],
])('개막·진행 동의 표현도 완료로 바꾸지 않는다: %s', (source, claim) => {
  expect(sourceStateIssue(draft(claim), source)).not.toBeNull();
});
