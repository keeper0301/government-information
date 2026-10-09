import { expect, it } from 'vitest';
import { newsDraftIssue } from '@/lib/news-publication/validation';
import { collectSourceFacts, prepareSourceDraft } from '@/lib/news-publication/source-facts';

const quote = '청년은 공식 누리집 https://example.go.kr/apply 에서 참여 방법을 확인할 수 있습니다.';
const quotes = [quote, '소득과 주소 조건을 확인합니다.', '지원 결정은 별도 심사합니다.'];
const body = quotes.join('\n');
const draft = () => ({ kind: 'application', title: '청년 지원 신청 전 확인할 조건과 심사 범위',
  question: '신청 방법과 지원 결정은 어떻게 구분하나요?', answer: '공식 안내에서 참여 방법을 확인하고 개인의 조건과 심사 결과를 구분해야 합니다.',
  audience: '지원 신청을 준비하는 청년', sections: [
    { heading: '공식 안내에서 확인할 참여 방법', quote, quoteIndex: 0, caseIndex: -1,
      paragraphs: ['기관의 누리집에서 참여 절차를 확인할 수 있습니다. 신청 창구를 찾았다는 사실과 지원을 받을 자격이 있다는 판단은 구분해야 합니다. 키피오의 제안: 원문에 나온 참여 방법과 본인의 상황을 먼저 비교해보세요.'] },
    { heading: '소득과 주소 조건의 확인', quote: '소득과 주소 조건을 확인합니다.', quoteIndex: 1, caseIndex: -1,
      paragraphs: ['거주 조건과 소득 조건을 각각 살펴볼 필요가 있습니다. 한 조건이 맞더라도 나머지 조건을 모두 충족한다고 해석할 수는 없습니다. 개인에게 적용되는 기준은 담당 기관의 구체적인 안내를 바탕으로 판단해야 합니다.'] },
    { heading: '신청 이후 결정의 범위', quote: '지원 결정은 별도 심사합니다.', quoteIndex: 2, caseIndex: -1,
      paragraphs: ['접수와 최종 결정은 서로 다른 단계입니다. 신청했다는 이유만으로 지원이 확정되었다고 판단할 수는 없습니다. 원문에서 밝히지 않은 심사 완료 날짜나 지급 시점을 추가해 가계 계획의 확정 일정으로 안내하지 않습니다.'] },
  ] });

it('주소가 포함된 원문 근거는 그대로 보존하고 공개 설명과 구분한다', () => {
  const value = draft(); const before = structuredClone(value);
  expect(newsDraftIssue(value, body)).toBeNull();
  expect(value).toEqual(before);
});

it('주소를 포함한 근거를 준비해도 잘못된 사례 번호를 놓치지 않는다', () => {
  const value = draft(); value.sections[0].caseIndex = 7;
  expect(prepareSourceDraft(value, collectSourceFacts(body, quotes), quotes).issue)
    .toBe('원문 사례 번호가 없거나 범위를 벗어났습니다.');
});

it('원문에 없는 주소로 바꾼 근거는 계속 보류한다', () => {
  const value = draft(); value.sections[0].quote = quote.replace('example.go.kr', 'other.go.kr');
  expect(newsDraftIssue(value, body)).toBe('인용문이 공식 원문과 일치하지 않습니다.');
});

it.each(['title', 'question', 'answer', 'audience'] as const)('공개 %s의 주소 제한은 유지한다', field => {
  const value = draft(); value[field] += ' https://example.go.kr/apply';
  expect(newsDraftIssue(value, body)).not.toBeNull();
});

it.each(['heading', 'paragraph'] as const)('공개 본문 %s의 주소 제한은 유지한다', field => {
  const value = draft();
  if (field === 'heading') value.sections[0].heading += ' https://example.go.kr/apply';
  else value.sections[0].paragraphs[0] += ' https://example.go.kr/apply';
  expect(newsDraftIssue(value, body)).toBe('단락 또는 인용문의 형식이 맞지 않습니다.');
});

it.each(['<태그>를 포함한 근거입니다.', '짧음', 'English only source', '가'.repeat(301)])('다른 근거 형식 제한은 유지한다: %s', invalid => {
  const value = draft(); value.sections[0].quote = invalid;
  expect(newsDraftIssue(value, body + '\n' + invalid)).toBe('단락 또는 인용문의 형식이 맞지 않습니다.');
});
