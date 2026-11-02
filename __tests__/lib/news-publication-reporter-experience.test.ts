import { expect, it } from 'vitest';
import { reporterExperienceIssue } from '@/lib/news-publication/reporter-experience';
import type { NewsDraft } from '@/lib/news-publication/validation';
const quote = '나 역시 이번 행사가 없었다면 궤를 직접 볼 기회가 없었을 것이다.';
const draft = (text: string, evidence = quote): NewsDraft => ({ kind: 'report', title: '공예품 체험 소개',
  question: '어떤 체험인가요?', answer: '원문 기자의 체험을 소개합니다.', audience: '공예품에 관심 있는 시민',
  sections: [{ heading: '원문 기자의 체험', quote: evidence, paragraphs: [text] }] });
it('한 사람의 경험을 집단 반응으로 바꾸면 보류한다', () => {
  expect(reporterExperienceIssue(draft('참관 시민들은 생활의 연결을 깨달았다.'), quote)).toContain('개인');
});
it('구매 가능 안내를 구매 경험으로 바꾸면 보류한다', () => {
  expect(reporterExperienceIssue(draft('한 시민은 직접 보고 구매하는 경험을 했다.'), quote + ' 물건을 구매할 수 있다.')).toContain('구매');
});
it('기자의 관찰·구매 가능성은 실제 구매로 오인하지 않는다', () => {
  expect(reporterExperienceIssue(draft('원문 기자는 궤를 직접 보고 활용을 떠올렸다. 현장에서는 구매할 수 있다고 안내했다.'), quote)).toBeNull();
});
it('원문에서 확인된 집단 반응과 실제 구매는 허용한다', () => {
  const source = '관람객들은 공예품에 관심을 보였다. 나는 컵을 구매했다.';
  expect(reporterExperienceIssue(draft('관람객들은 관심을 보였다. 원문 기자는 컵을 구매했다.', source), source)).toBeNull();
});
it('요약과 제목도 집단 반응 왜곡을 검사한다', () => {
  const value = draft('원문 기자는 작품을 보았다.');
  value.answer = '관람객들은 새로운 경험을 했다.';
  expect(reporterExperienceIssue(value, quote)).toContain('개인');
});
it('실제 구매를 부정하는 설명은 허용하되 별도 구매 주장은 보류한다', () => {
  expect(reporterExperienceIssue(draft('구매한 경험은 없다.'), quote)).toBeNull();
  expect(reporterExperienceIssue(draft('구매한 경험은 없다. 다른 시민은 구매했다.'), quote)).toContain('구매');
  expect(reporterExperienceIssue(draft('나는 구매한 경험은 없지만 다른 시민은 구매했다.'), quote)).toContain('구매');
});
it('모든 방문객에게 제공되는 구매 안내는 경험 집단화가 아니다', () => {
  const source = '나는 공예품을 구경했다. 현장에서 누구나 공예품을 구매할 수 있다.';
  expect(reporterExperienceIssue(draft('방문객들은 현장에서 공예품을 구매할 수 있다.', source), source)).toBeNull();
});
it('다른 행사의 구매 사실을 해당 인용의 근거로 빌리지 않는다', () => {
  const source = '나는 공예품을 구경했다. 지난해 다른 행사에서 컵을 구매했다.';
  expect(reporterExperienceIssue(draft('나는 이번 행사에서 궤를 구매했다.', '나는 공예품을 구경했다.'), source)).toContain('구매');
});
it.each([
  '원문 기자는 공예품의 새로운 쓰임을 깨달았다. 방문객들은 현장에서 공예품을 구매할 수 있다.',
  '방문객들은 현장에서 공예품을 구매할 수 있고 원문 기자는 새로운 쓰임을 깨달았다.',
])('기자 경험과 방문객 이용 안내가 섞여도 주어를 구분한다: %s', text => {
  const source = '나는 공예품의 새로운 쓰임을 깨달았다. 현장에서 누구나 공예품을 구매할 수 있다.';
  expect(reporterExperienceIssue(draft(text, source), source)).toBeNull();
});
