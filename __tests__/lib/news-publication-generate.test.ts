import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.useRealTimers(); mock.call.mockReset(); });
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
  { passed: true, reason: '대상 설명과 개인별 지원 확정을 구분하고 실제 확인할 내용을 안내했습니다.', excerptIndex: 2 }]));

it('작성에 30초가 걸려도 시간 안에 응답하면 별도 검사를 거쳐 통과한다', async () => {
  vi.useFakeTimers();
  mock.call.mockImplementation(input => new Promise((resolve, reject) => {
    const judgment = { supported: true, originalValue: true, quality: quality(), issues: [],
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) };
    const deadline = setTimeout(() => reject(new Error('응답 시간 초과')), input.timeoutMs);
    setTimeout(() => { clearTimeout(deadline); resolve(JSON.stringify(input.prompt.startsWith('작성자와 분리된') ? judgment : draft)); },
      input.prompt.startsWith('작성자와 분리된') ? 1000 : 30000);
  }));
  const outcome = generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' }).then(value => ({ value }), error => ({ error }));
  await vi.advanceTimersByTimeAsync(31000);
  expect(await outcome).toHaveProperty('value.editorialReview');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
it('재작성해도 세 호출의 대기 시간 합계는 90초이며 사실 검사를 생략하지 않는다', async () => {
  mock.call.mockResolvedValueOnce(JSON.stringify({ ...draft, title: '제'.repeat(81) }))
    .mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true,
      originalValue: true, quality: quality(), issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) }));
  await generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(mock.call.mock.calls.map(([input]) => input.timeoutMs)).toEqual([40000, 25000, 25000]);
  expect(mock.call.mock.calls[2][0].prompt).toContain('작성자와 분리된 정책 사실 검증 역할');
});

it('긴 문단은 문장 내용을 보존해 나누며 별도 사실 검사를 그대로 요구한다', async () => {
  // 실제 초안에서 240자 제한을 네 글자 넘었던 문단입니다. 사실 판정은 모의 응답으로 분리합니다.
  const paragraph = '행사는 관광 통역 안내, 호텔 고객서비스 컨시어지, MICE 운영 행사 기획, 의료 관광 코디네이터, 여행 상품 기획 운영의 5대 유망 직무를 중심으로 구성됐다. 1부 토크콘서트에서는 현직 전문가들이 중장년층의 경험과 소통 능력이 관광산업에서 강점임을 설명하며 참가자들과 소통했다. 2부에서는 별도로 마련된 직무별 부스에서 1:1 멘토링이 진행돼 자격증 취득, 진입 장벽, 근무 형태 등 실무에 관한 구체적 정보를 얻는 기회를 제공했다.';
  expect(paragraph).toHaveLength(244);
  const formattedDraft = { ...draft, sections: draft.sections.map((section, index) =>
    index === 0 ? { ...section, paragraphs: [paragraph] } : section) };
  mock.call.mockReset();
  mock.call.mockImplementation(async input => JSON.stringify(input.prompt.startsWith('작성자와 분리된 정책 사실 검증 역할')
    ? { supported: true, originalValue: true, quality: quality(), issues: [],
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) } : formattedDraft));
  const result = await generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: `${quote} 5대 직무, 1부와 2부의 1:1 상담입니다.`, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(result.sections[0].paragraphs.length).toBeGreaterThan(1);
  expect(result.sections[0].paragraphs.every(text => text.length <= 240)).toBe(true);
  expect(result.sections[0].paragraphs.join(' ')).toBe(paragraph);
  expect(result.sections.slice(1)).toEqual(draft.sections.slice(1).map(section => ({ ...section, quote })));
  expect(mock.call.mock.calls[1][0].prompt).toContain(JSON.stringify(result.sections[0].paragraphs));
  expect(mock.call).toHaveBeenCalledTimes(2);
  // 글의 일부가 늘어나도 모든 본문 부분의 원문 근거 번호가 필수여야 합니다.
  const response = mock.call.mock.calls[0][0].responseSchema;
  expect(response.schema.required).toContain('sections');
  expect(response.schema.properties.sections.items.required).toContain('quoteIndex');
  expect(mock.call.mock.calls[1][0].responseSchema).toBeUndefined();
});

it.each(['긴 문장', '네 문단 이상'])('문단을 나눠도 기존 제한을 넘는 초안은 보류한다: %s', async kind => {
  const prose = kind === '긴 문장'
    ? draft.sections.flatMap(section => section.paragraphs).join(' ').replace(/[.!?。]/g, '')
    : Array.from({ length: 4 }, () => draft.sections[0].paragraphs[0] + ' ' + draft.sections[1].paragraphs[0]).join(' ');
  const invalidDraft = { ...draft, sections: draft.sections.map((section, index) =>
    index === 0 ? { ...section, paragraphs: [prose] } : section) };
  mock.call.mockReset(); mock.call.mockResolvedValue(JSON.stringify(invalidDraft));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow(
    kind === '긴 문장' ? '한 문단이 너무 깁니다' : '단락 또는 인용문');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

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
  mock.call.mockResolvedValueOnce(JSON.stringify({ ...draft, question: '2026년 발표된 지원의 대상과 지급 결정은 어떻게 구분하나요?' }))
    .mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, quality: quality(), issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) }));
  const result = await generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(result.sections.map(section => section.quote)).toEqual([quote, quote, quote]);
  expect(result.question).toContain('2026년');
  expect(mock.call.mock.calls.every(([input]) => input.prompt.includes('한국 시간 기준 검사일: 2026-10-07'))).toBe(true);
  expect(mock.call.mock.calls[1][0].prompt).toContain(quote);
  expect(mock.call.mock.calls[1][0].model).toBe('gpt-4.1-mini');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it.each(['누락', '원문 밖 인용', '개별 불일치'])('전체 합격이어도 개별 근거 검사 %s은 보류한다', async kind => {
  mock.call.mockReset();
  const checks = kind === '누락' ? [] : [0, 1, 2, 3].map(part => ({ part,
    supported: !(kind === '개별 불일치' && part === 2), quoteIndex: kind === '원문 밖 인용' ? -1 : 0 }));
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, issues: [], checks }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('별도 사실 대조');
});

it('사실 합격이어도 독자 품질 검사에서 범위 확대를 판정하면 공개하지 않는다', async () => {
  mock.call.mockReset();
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true,
    issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })), quality: { ...quality(), scope: { passed: false } } }));
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
    part: kind === '부분 번호 중복' && part === 6 ? 5 : part, supported: true, quoteIndex: 0 }));
  mock.call.mockResolvedValueOnce(JSON.stringify(extended)).mockResolvedValueOnce(JSON.stringify({
    supported: true, originalValue: true, quality: quality(), issues: [], checks }));
  const result = generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  if (kind === '전체 대조') await expect(result).resolves.toMatchObject({ sections: expect.any(Array) });
  else await expect(result).rejects.toThrow('별도 사실 대조');
  expect(mock.call.mock.calls[1][0].prompt).toContain('총 7개가 필요합니다');
  const example = JSON.parse(mock.call.mock.calls[1][0].prompt.split('검사 응답 형식: ')[1]);
  expect(example.checks.map((check: { part: number }) => check.part)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

it('원문 문장을 품질 근거로 대신 쓰거나 초안 밖 번호를 선택하면 보류한다', async () => {
  mock.call.mockReset();
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true,
    originalValue: true, issues: [], checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })),
    quality: { ...quality(), coverage: { passed: true, reason: '원문의 중요한 내용을 보존했다고 주장합니다.', excerpt: quote, excerptIndex: -1 } } }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('독자 관점 품질');
});

it('형식을 요구해도 근거 번호가 없는 응답은 기존 검사에서 보류한다', async () => {
  const missingEvidence = { ...draft, sections: draft.sections.map((section, index) =>
    index === 2 ? { heading: section.heading, paragraphs: section.paragraphs } : section) };
  mock.call.mockResolvedValue(JSON.stringify(missingEvidence));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('단락 또는 인용문');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
