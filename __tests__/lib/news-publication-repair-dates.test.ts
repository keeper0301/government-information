import { afterEach, expect, it, vi } from 'vitest';
import { makeCopyRepair, applyCopyRepair } from '@/lib/news-publication/copy-repair';
import { newsDraftIssue } from '@/lib/news-publication/validation';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const quote = '기관은 상담 참여자의 경험과 상담 내용을 소개합니다.';
const source = `${quote}\n발표 자료의 상담 날짜는 2026.10.8.입니다. 참석자는 70여 명입니다.`;
const input = (date = '2026년 10월 8일') => ({ kind: 'change', title: '상담 참여와 실제 지원 결정의 차이',
  question: '상담 참여 안내와 지원 결정은 어떻게 구분하나요?',
  answer: `원문에 소개된 상담 날짜는 ${date}입니다. 상담에 참여했다는 사실이 지원 확정을 뜻하지는 않습니다.`,
  audience: '상담 안내를 읽고 자신의 선택을 판단하는 독자', sections: [
    { heading: '참석 인원의 의미', quote, quoteIndex: 0, caseIndex: -1,
      paragraphs: ['참석자는 70명으로 소개됐습니다. 현장 참여 규모와 개인별 지원 여부는 다른 정보이며, 소개된 참여 숫자를 모든 독자에게 보장되는 지원 인원으로 해석할 수는 없습니다.'] },
    { heading: '상담 내용과 개별 결정의 구분', quote, quoteIndex: 0, caseIndex: -1,
      paragraphs: ['상담에서 다룬 경험은 참여자 개인의 상황을 바탕으로 읽을 필요가 있습니다. 한 사례를 읽었다는 이유만으로 본인에게 같은 결과가 적용된다고 판단할 수는 없으며, 기관이 발표한 사실과 개인의 선택을 나누어 살펴볼 수 있습니다.'] },
    { heading: '독자가 정보를 비교하는 기준', quote, quoteIndex: 0, caseIndex: -1,
      paragraphs: ['키피오의 제안: 원문에서 설명한 경험과 자신의 상황이 어느 부분에서 같고 다른지 비교해보세요. 참여 인원은 행사의 규모를 보여주는 정보입니다. 개인이 받을 혜택의 크기나 향후 일정까지 확인한 근거로 확대하지 않습니다.'] },
  ] });
const issue = (value: unknown, body = source) => newsDraftIssue(value, body, '2026-10-08')!;

it('정상 날짜를 보존하고 잘못된 확정 인원 문단만 수정 대상으로 선택한다', () => {
  const value = input(); const before = structuredClone(value);
  expect(issue(value)).toContain('70명 → 70여명');
  const plan = makeCopyRepair(value, source, issue(value), '2026-10-08');
  expect(plan?.targets.map(target => [target.sectionIndex, target.paragraphIndex])).toEqual([[0, 0]]);
  const replacement = value.sections[0].paragraphs[0].replace('70명', '70여 명');
  const repaired = applyCopyRepair(value, { edits: { paragraph_0: replacement } }, plan!);
  expect(repaired).toEqual({ ...value, sections: [{ ...value.sections[0], paragraphs: [replacement] }, ...value.sections.slice(1)] });
  expect(newsDraftIssue(repaired, source, '2026-10-08')).toBeNull();
  expect(value).toEqual(before);
});

it('정상 날짜가 있는 별도 본문을 수정 대상으로 잘못 선택하지 않는다', () => {
  const value = input(); value.answer = '상담 참여 사실과 개인별 지원 결정은 서로 다른 정보로 판단해야 합니다.';
  value.sections[1].paragraphs[0] += ' 상담 날짜는 2026년 10월 8일입니다.';
  const plan = makeCopyRepair(value, source, issue(value), '2026-10-08');
  expect(plan?.targets.map(target => [target.sectionIndex, target.paragraphIndex])).toEqual([[0, 0]]);
});

it.each(['2026년 10월 9일', '2027년 10월 8일', '10월 8일'])('근거 없는 날짜는 부분 수정으로 통과시키지 않는다: %s', date => {
  const value = input(date);
  expect(makeCopyRepair(value, source, issue(value), '2026-10-08')).toBeNull();
});

it('서로 다른 필드의 연도·월·일을 합쳐 정상 날짜로 만들지 않는다', () => {
  const value = input('2026년'); value.question = '10월 8일 상담 안내는 어떻게 읽나요?';
  expect(makeCopyRepair(value, source, issue(value), '2026-10-08')).toBeNull();
});

it('본문 밖에 있는 잘못된 숫자는 기존 전체 재작성 대상으로 유지한다', () => {
  const value = input(); value.answer += ' 참석자는 70명입니다.';
  expect(makeCopyRepair(value, source, issue(value), '2026-10-08')).toBeNull();
});

it('작성 경로에서 전체 재작성 대신 숫자 문단만 고치고 별도 사실 검사를 거친다', async () => {
  const value = input();
  mock.call.mockImplementation(async request => {
    if (request.jsonMode) return JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'].map(key =>
        [key, { passed: true, reason: '상담 참여 규모와 개인별 지원 결정의 차이를 본문에서 설명했습니다.', excerptIndex: 1 }])),
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) });
    if (request.responseSchema.name === 'policy_news_copy_repair')
      return JSON.stringify({ edits: { paragraph_0: value.sections[0].paragraphs[0].replace('70명', '70여 명') } });
    return JSON.stringify(value);
  });
  const result = await generateVerifiedNews({ title: '상담 참여 안내', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973216',
    body: source, publishedAt: '2026-10-08', hash: '검사용 원문' });
  expect(mock.call).toHaveBeenCalledTimes(3);
  expect(mock.call.mock.calls[1][0].responseSchema.name).toBe('policy_news_copy_repair');
  expect(result.answer).toBe(value.answer);
  expect(result.sections[1].paragraphs).toEqual(value.sections[1].paragraphs);
  expect(result.sections[0].paragraphs[0]).toContain('70여 명');
  expect(result).toHaveProperty('editorialReview');
});
