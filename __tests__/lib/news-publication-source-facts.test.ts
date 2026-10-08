import { afterEach, expect, it, vi } from 'vitest';
import { collectSourceFacts, prepareSourceDraft } from '@/lib/news-publication/source-facts';
import { newsDraftIssue } from '@/lib/news-publication/validation';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const quotes = [
  '박진우(54세, 가명)는 영업 업무에서 쌓은 경험을 통역 안내 직무와 연결했습니다.',
  '정은숙(51세, 가명)는 병원 행정 경험을 의료 관광 직무와 연결하고 교육을 희망했습니다.',
  '행사 참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계합니다.',
];
const body = quotes.join('\n');
const facts = collectSourceFacts(body, quotes);
const draft = { kind: 'report', title: '경력을 관광 직무와 연결한 두 참가자의 사례와 후속 정보',
  question: '참가자들은 기존 경력을 어떻게 활용했고 후속 지원 대상은 누구인가요?',
  answer: '두 참가자는 영업과 병원 행정 경력을 관광 직무와 연결했습니다. 후속 채용 정보 연계는 행사 참여자를 대상으로 10월 중 안내됩니다.',
  audience: '행사 참여자와 관광 직무 전환에 관심 있는 독자', sections: [
    { heading: '영업 경력을 활용한 직무 전환', caseIndex: 0, quoteIndex: 0,
      paragraphs: ['영업 업무에서 익힌 경험을 관광 통역 안내에 활용하려는 사례입니다. 기존에 해 온 일과 관심 있는 직무를 함께 살펴볼 수 있지만 한 참가자의 경험을 모든 사람의 취업 결과로 확대할 수는 없습니다.'] },
    { heading: '병원 행정 경험과 의료 관광', caseIndex: 1, quoteIndex: 1,
      paragraphs: ['병원에서 행정을 맡았던 경험을 의료 관광 분야와 연결한 사례입니다. 교육을 더 받고 싶다는 의견은 참가자의 희망이며 기관이 새로운 교육 과정을 확정했다는 발표와 구분해야 합니다.'] },
    { heading: '후속 정보의 대상과 기간', caseIndex: -1, quoteIndex: 2,
      paragraphs: ['채용 정보는 10월 중 행사 참여자를 대상으로 연계한다는 안내입니다. 일반 독자가 동일한 후속 지원을 받을 수 있는지는 이 원문으로 확인되지 않으며, 참여자가 아닌 사람의 모든 센터 이용이 금지된다는 뜻으로 확대하지 않습니다.'] },
  ] };

it('원문에 명시된 기간·대상 근거·가명 사례를 같은 근거 번호로 분리한다', () => {
  expect(facts.periods).toEqual([{ text: '10월 중', quoteIndexes: [2] }]);
  expect(facts.audienceQuoteIndexes).toEqual([2]);
  expect(facts.cases).toEqual([
    { name: '박진우', label: '박진우(54세, 가명)', quoteIndexes: [0] },
    { name: '정은숙', label: '정은숙(51세, 가명)', quoteIndexes: [1] },
  ]);
  expect(collectSourceFacts(body + '\n' + quotes[0], quotes).cases).toHaveLength(2);
  expect(collectSourceFacts('실명으로 소개한 시민 사례입니다.', quotes).cases).toEqual([]);
});

it('1월의 근거 번호에 11월 문장을 섞거나 긴 숫자의 일부를 월로 읽지 않는다', () => {
  const periods = collectSourceFacts('1월 중 상담. 11월 중 정보. 123월 중이라는 잘못된 문자열.',
    ['1월 중 상담.', '11월 중 정보.']).periods;
  expect(periods).toEqual([{ text: '1월 중', quoteIndexes: [0] }, { text: '11월 중', quoteIndexes: [1] }]);
});

it('두 사례의 가명과 원문 소개 표시를 붙이고 다시 조립해도 중복하지 않는다', () => {
  const prepared = prepareSourceDraft(draft, facts, quotes);
  expect(prepared.issue).toBeNull();
  const value = prepared.value as typeof draft;
  expect(value.sections[0].paragraphs[0]).toBe('원문에서 소개한 박진우(54세, 가명): ' + draft.sections[0].paragraphs[0]);
  expect(value.sections[1].paragraphs[0]).toBe('원문에서 소개한 정은숙(51세, 가명): ' + draft.sections[1].paragraphs[0]);
  expect(value.sections[2].paragraphs).toEqual(draft.sections[2].paragraphs);
  expect(prepareSourceDraft(value, facts, quotes).value).toEqual(value);
  expect(newsDraftIssue(value, body, '2026-10-06')).toBeNull();
});

it.each([undefined, -2, 2, 0.5, '0'])('누락되거나 잘못된 사례 번호는 보류한다: %s', caseIndex => {
  const value = { ...draft, sections: draft.sections.map((part, index) => index ? part : { ...part, caseIndex }) };
  expect(prepareSourceDraft(value, facts, quotes).issue).toContain('사례 번호');
});

it('다른 참가자의 혼합이나 일반 부분 표시로 사례를 우회할 수 없다', () => {
  for (const caseIndex of [0, -1]) {
    const value = { ...draft, sections: draft.sections.map((part, index) => index ? part :
      { ...part, caseIndex, paragraphs: ['박진우와 정은숙은 서로 다른 경력을 가지고 직무 상담을 받았습니다.'] }) };
    expect(prepareSourceDraft(value, facts, quotes).issue).not.toBeNull();
  }
});

it('사례 번호를 바꾸면서 다른 사람의 근거 번호를 그대로 사용할 수 없다', () => {
  const value = { ...draft, sections: draft.sections.map((part, index) => index ? part : { ...part, caseIndex: 1 }) };
  expect(prepareSourceDraft(value, facts, quotes).issue).toContain('해당 사람의 원문 근거 번호');
});

it('앞 부분의 사례 번호 누락보다 뒤 부분의 기존 인용 형식 오류를 먼저 보류한다', () => {
  const value = { ...draft, sections: draft.sections.map((part, index) =>
    index === 0 ? { ...part, caseIndex: undefined } : index === 2 ? { ...part, quoteIndex: undefined } : part) };
  const prepared = prepareSourceDraft(value, facts, quotes);
  expect(prepared.issue).toBeNull();
  expect(newsDraftIssue(prepared.value, body)).toContain('단락 또는 인용문');
});

it('표시를 붙여 분량이 넘으면 본문을 자르지 않고 기존 검사에서 보류한다', () => {
  const paragraph = '경력과 직무를 연결한 사례 설명입니다. ' + '가'.repeat(205);
  const value = { ...draft, sections: draft.sections.map((part, index) => index ? part : { ...part, paragraphs: [paragraph] }) };
  const prepared = prepareSourceDraft(value, facts, quotes);
  expect(prepared.issue).toBeNull();
  expect((prepared.value as typeof draft).sections[0].paragraphs[0]).toContain(paragraph);
  expect(newsDraftIssue(prepared.value, body)).toContain('한 문단이 너무 깁니다');
});

it('기간 확대나 누락 사례를 조립 과정에서 자동으로 바로잡지 않는다', () => {
  const value = { ...draft, sections: draft.sections.map((part, index) => index === 2 ?
    { ...part, paragraphs: [part.paragraphs[0].replace('10월 중', '10월 한 달간')] } : part) };
  expect(newsDraftIssue(prepareSourceDraft(value, facts, quotes).value, body)).toContain('월 전체');
  const missing = { ...draft, sections: draft.sections.map(part => ({ ...part, caseIndex: -1 })) };
  expect(newsDraftIssue(prepareSourceDraft(missing, facts, quotes).value, body)).toContain('박진우');
});

it.each(['참여자에 한해 채용 정보를 제공합니다.', '참가자에 한하여 지원합니다.'])
('대상 안내만 있는 원문에서 한해·한하여 제한을 만들면 보류한다: %s', answer => {
  const prepared = prepareSourceDraft({ ...draft, answer }, facts, quotes);
  expect(newsDraftIssue(prepared.value, body)).toContain('이용 제한');
  expect(newsDraftIssue(prepared.value, body + ' ' + answer)).toBeNull();
});

it('한해 제한을 직접 부정한 설명은 허용하지만 부정한 원문을 긍정 제한의 근거로 쓰지 않는다', () => {
  const answer = '참여자에 한해 지원된다는 뜻은 아닙니다.';
  expect(newsDraftIssue(prepareSourceDraft({ ...draft, answer }, facts, quotes).value, body)).toBeNull();
  const restricted = prepareSourceDraft({ ...draft, answer: '참여자에 한해 지원합니다.' }, facts, quotes).value;
  expect(newsDraftIssue(restricted, body + ' ' + answer)).toContain('이용 제한');
});

it('실제 작성 함수도 조립한 최종 본문을 별도 사실·품질 검사에 전달한다', async () => {
  mock.call.mockImplementation(async input => {
    if (!input.jsonMode) return JSON.stringify(draft);
    const text = input.prompt.split('검사할 글: ')[1].split('\n제목·질문')[0];
    const finalDraft = JSON.parse(text);
    expect(finalDraft.sections[0].paragraphs[0]).toContain('원문에서 소개한 박진우(54세, 가명)');
    expect(finalDraft.sections[1].paragraphs[0]).toContain('원문에서 소개한 정은숙(51세, 가명)');
    return JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'].map(key =>
        [key, { passed: true, reason: '원문에서 확인한 두 참가자의 경력과 후속 정보의 범위를 보존했습니다.', excerptIndex: 2 }])),
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: part ? part - 1 : 2 })) });
  });
  const result = await generateVerifiedNews({ title: '공식 사례 소개', body, url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972905',
    publishedAt: '2026-10-06', hash: '원문 식별값' });
  expect(result).toHaveProperty('editorialReview');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[0][0].responseSchema.schema.properties.sections.items.required).toContain('caseIndex');
});

it('사례 번호가 잘못돼도 재작성은 한 번이며 별도 합격을 만들어 내지 않는다', async () => {
  mock.call.mockResolvedValue(JSON.stringify({ ...draft, sections: draft.sections.map(part => ({ ...part, caseIndex: 7 })) }));
  await expect(generateVerifiedNews({ title: '공식 사례 소개', body, url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972905',
    publishedAt: '2026-10-06', hash: '원문 식별값' })).rejects.toThrow('원문 사례 번호');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
