import { expect, it } from 'vitest';
import { newsDraftIssue } from '@/lib/news-publication/validation';
import { makeCopyRepair } from '@/lib/news-publication/copy-repair';

const source = '의무복무 병사는 5000만 원 한도의 단체 보험을 지원합니다. 전역 이후에는 5세대 실손보험 수준을 기준으로 안내합니다.';
const draft = (amount = '5000만 원', generation = '5세대') => ({
  kind: 'change', title: '군 복무 청년 보험 안내의 보장 기준 비교',
  question: '보험 한도와 전역 후 보장 기준은 어떻게 구분하나요?',
  answer: '보장 한도와 보험 세대의 숫자를 서로 다른 기준으로 읽으세요.', audience: '군 복무 청년',
  sections: [
    { heading: '단체 보험의 금액', quote: '의무복무 병사는', paragraphs: [
      `단체 보험의 한도는 ${amount}입니다. 한도는 개인에게 같은 금액을 지급한다는 약속과 구별해서 읽어야 합니다. 키피오의 제안: 보장 항목과 최고 한도를 나누어 적고 개인의 지급 여부를 이 설명만으로 확정하지 마세요.`] },
    { heading: '전역 후 보험 기준', quote: '전역 이후에는', paragraphs: [
      `전역 이후의 안내는 ${generation} 실손보험 수준을 기준으로 합니다. 보험 세대의 숫자는 병사의 나이를 뜻하지 않습니다. 키피오의 제안: 복무 중 단체 보험과 전역 후 보장 기준을 서로 다른 항목으로 비교하세요.`] },
    { heading: '정보를 비교하는 방법', quote: '보험을 지원합니다.', paragraphs: [
      '키피오의 제안: 원문에서 확인한 보장 항목과 설명의 범위를 비교하세요. 이 글은 새로운 신청 조건을 만드는 안내가 아니며, 기관이 발표하지 않은 서류나 신청 절차를 추측해 추가하지 않습니다.'] },
  ],
});

it('원문의 보험 세대 숫자는 나이 단위와 구별한다', () => {
  expect(newsDraftIssue(draft(), source)).toBeNull();
  expect(newsDraftIssue(draft('5000만 원', '5세'), source)).toContain('확인하지 못한 숫자: 5세');
});

it('금액 단위 변환을 보류하면서 보험 세대를 나이 수정 안내로 쓰지 않는다', () => {
  const issue = newsDraftIssue(draft('5천만 원'), source)!;
  expect(issue).toContain('확인하지 못한 숫자: 5천만원');
  expect(issue).not.toContain('→');
  expect(makeCopyRepair(draft('5천만 원'), source, issue)).toBeNull();
});

it('원문과 같은 천만 원 표기는 인정하며 금액이 바뀌면 보류한다', () => {
  const sameUnitSource = source.replace('5000만 원', '5천만 원');
  expect(newsDraftIssue(draft('5천만 원'), sameUnitSource)).toBeNull();
  expect(newsDraftIssue(draft('6천만 원'), sameUnitSource)).toContain('확인하지 못한 숫자: 6천만원');
});
