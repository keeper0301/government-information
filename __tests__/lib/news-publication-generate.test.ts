import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.useRealTimers(); });
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';

const quote = '청년 근로자가 신청할 수 있습니다.';
const draft = { kind: 'application', title: '청년 근로자 지원, 대상과 지급 결정 구분',
  question: '신청 대상이면 지원이 확정되나요?', answer: '신청 대상과 지원 확정 여부는 구분해서 확인해야 합니다.', audience: '청년 근로자',
  sections: [
    { heading: '대상을 확인하는 방법은?', paragraphs: ['청년 근로자라는 대상 설명만으로 개별 지원이 확정되지는 않습니다. 본인에게 적용되는 조건은 기관의 실제 신청 안내와 대조해야 합니다. 추가 자격 조건을 추측해서 안내하지 마세요.'], quoteIndex: 0 },
    { heading: '지금 무엇을 확인하나요?', paragraphs: ['키피오의 제안: 담당 창구에 현재 접수 가능 여부와 본인에게 필요한 절차를 문의하세요. 신청할 수 있다는 설명을 별도 확인이나 선정 단계가 없다는 의미로 넓히면 안 됩니다.'], quoteIndex: 0 },
    { heading: '확정하지 않은 내용은?', paragraphs: ['이 발표만으로 지원 금액과 제출 서류를 특정할 수 없습니다. 확인된 신청 자격과 실제로 결정된 혜택을 구분하여 안내하고, 부족한 정보는 기관의 최신 공고를 확인해야 합니다.'], quoteIndex: 0 },
  ] };
const quality = () => Object.fromEntries(['scope','timeliness','usefulness','clarity','nonRepetition','coverage'].map(key => [key,
  { passed: true, reason: '대상 설명과 개인별 지원 확정을 구분하고 실제 확인할 내용을 안내했습니다.', excerpt: draft.answer }]));

it('최소 구성 예시는 세 부분이며 한 부분 초안은 보류한다', async () => {
  mock.call.mockResolvedValue(JSON.stringify({ question: '무엇을 확인하나요?', answer: '공식 발표를 확인하세요.',
    audience: '정책 대상 시민', sections: [{ heading: '대상 확인', paragraphs: ['조건을 확인하세요.'], quoteIndex: 0 }] }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: '공식 발표입니다.', hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('본문 3~6개 부분의 형식');
  const prompt = mock.call.mock.calls[0][0].prompt as string;
  const example = JSON.parse(prompt.split('JSON 형식: ')[1]);
  expect(example.sections).toHaveLength(3);
  expect(example.sections.every((section: { quoteIndex: number }) => Number.isInteger(section.quoteIndex))).toBe(true);
  expect(prompt).toContain('선택 가능한 원문 근거:');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it('선택한 근거 번호를 원문 그대로 연결하고 별도 사실 검사에도 전달한다', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T16:00:00Z'));
  mock.call.mockReset();
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, quality: quality(), issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quote })) }));
  const result = await generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(result.sections.map(section => section.quote)).toEqual([quote, quote, quote]);
  expect(mock.call.mock.calls.every(([input]) => input.prompt.includes('한국 시간 기준 검사일: 2026-10-07'))).toBe(true);
  expect(mock.call.mock.calls[1][0].prompt).toContain(quote);
  expect(mock.call.mock.calls[1][0].model).toBe('gpt-4.1-mini');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it.each(['누락', '원문 밖 인용', '개별 불일치'])('전체 합격이어도 개별 근거 검사 %s은 보류한다', async kind => {
  mock.call.mockReset();
  const checks = kind === '누락' ? [] : [0, 1, 2, 3].map(part => ({ part,
    supported: !(kind === '개별 불일치' && part === 2), quote: kind === '원문 밖 인용' ? '자동으로 모든 지원금이 지급됩니다.' : quote }));
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, issues: [], checks }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('별도 사실 대조');
});

it('사실 합격이어도 독자 품질 검사에서 범위 확대를 판정하면 공개하지 않는다', async () => {
  mock.call.mockReset();
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true,
    issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quote })), quality: { ...quality(), scope: { passed: false } } }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('독자 관점 품질');
});
it('활용 정보가 없는 후보는 불필요한 작성 재시도나 판정 호출 없이 보류한다', async () => {
  mock.call.mockReset(); mock.call.mockResolvedValueOnce(JSON.stringify({ skip: true }));
  await expect(generateVerifiedNews({ title: '행사 후기', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('핵심 정보가 부족');
  expect(mock.call).toHaveBeenCalledTimes(1);
});

it.each(['전체 대조', '마지막 부분 누락', '부분 번호 중복'])('여섯 부분 기사도 모든 부분을 사실 대조한다: %s', async kind => {
  mock.call.mockReset();
  const extended = { ...draft, sections: [...draft.sections,
    { heading: '현장에서 질문한 내용', paragraphs: ['현장에서 나온 질문은 본인의 준비 상황을 비교할 때 참고할 수 있습니다. 개인의 사례를 다른 사람의 지원 결과로 확장해 해석하지 않습니다.'], quoteIndex: 0 },
    { heading: '지원과 상담의 관계', paragraphs: ['상담에서 받는 정보와 담당 기관이 실제로 결정하는 지원 결과는 구분됩니다. 안내를 읽은 뒤 본인의 상황과 비교하는 과정이 필요합니다.'], quoteIndex: 0 },
    { heading: '원문을 읽을 때 구분할 점', paragraphs: ['발표 내용에 있는 설명과 키피오가 제안한 행동은 서로 다른 성격입니다. 글에서 제안으로 표시한 사항은 정부가 의무로 정한 준비 항목이 아닙니다.'], quoteIndex: 0 },
  ] };
  const checks = Array.from({ length: kind === '마지막 부분 누락' ? 6 : 7 }, (_, part) => ({
    part: kind === '부분 번호 중복' && part === 6 ? 5 : part, supported: true, quote }));
  mock.call.mockResolvedValueOnce(JSON.stringify(extended)).mockResolvedValueOnce(JSON.stringify({
    supported: true, originalValue: true, quality: quality(), issues: [], checks }));
  const result = generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  if (kind === '전체 대조') await expect(result).resolves.toMatchObject({ sections: expect.any(Array) });
  else await expect(result).rejects.toThrow('별도 사실 대조');
  expect(mock.call.mock.calls[1][0].prompt).toContain('총 7개가 필요합니다');
});
