import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
import { restoreSourceAmounts } from '@/lib/news-publication/source-amounts';
import { makeCopyRepair } from '@/lib/news-publication/copy-repair';
afterEach(() => mock.call.mockReset());

const body = '청년 근로자가 신청할 수 있습니다.';
const draft = { kind: 'application', title: '신청 대상과 실제 지원 확정의 차이',
  question: '대상에 해당하면 바로 지원이 확정되나요?', answer: '신청 대상이라는 설명과 개인별 지원 결정은 구분해야 합니다.', audience: '청년 근로자',
  sections: [
    { heading: '원문의 대상 안내', paragraphs: ['대상으로 안내됐다는 사실은 최종 지급 결정을 뜻하지 않습니다. 원문에서 확인된 신청 범위와 개인의 상황을 나누어 읽어야 합니다. 추가 자격 조건을 만들어 설명하지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '신청과 선정 구분', paragraphs: ['키피오의 제안: 현재 접수 가능 여부를 담당 창구에 확인하세요. 실제 안내에 있는 조건을 자신의 상황과 비교한 뒤 신청 여부를 판단할 수 있습니다. 개인별 선정 결과를 이 기사에서 확정할 수는 없습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '지원 내용의 확인 범위', paragraphs: ['이 원문만으로 지원 금액과 지급 시점을 특정할 수 없습니다. 알려진 대상 범위와 확인할 수 없는 세부 조건을 나누어 판단해야 합니다. 신청 설명을 심사가 필요 없다는 뜻으로 바꾸지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '이용 판단의 기준', paragraphs: ['키피오의 제안: 대상 안내와 기관의 실제 신청 공고를 함께 읽으세요. 개인에게 필요한 절차는 공식 공고에서 확인한 내용만 정리하는 것이 좋습니다. 유사한 정책의 조건을 가져와 새 의무처럼 안내하지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
  ] };
const source = { title: '공식 신청 안내', body, hash: '원문 식별값', publishedAt: '2026-10-06',
  url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915' };
const judgment = (parts: number[]) => ({ supported: true, originalValue: true, issues: [],
  quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
    .map(key => [key, { passed: true, reason: '대상 안내와 개인별 지원 결정을 구분하는 해설이 있습니다.', excerptIndex: 0 }])),
  checks: parts.map(part => ({ part, supported: true, quoteIndex: 0 })),
});

// 보호 대상: 답변의 잘못된 연도가 본문 금액 수정에 가려지지 않도록 실제 작성 연결을 확인합니다.
it('금액과 원문에 없는 연도가 함께 있으면 본문만 고치지 않고 전체 초안을 한 번 수정한다', async () => {
  const invalid = structuredClone(draft);
  invalid.answer = '2024년부터 청년 근로자가 신청할 수 있으며 개인별 지급 결정은 구분해야 합니다.';
  invalid.sections[1].paragraphs[0] += ' 단체 보험 한도는 5천만 원입니다.';
  const corrected = structuredClone(draft);
  corrected.sections[1].paragraphs[0] += ' 단체 보험 한도는 5000만 원입니다.';
  mock.call.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(corrected))
    .mockResolvedValueOnce(JSON.stringify(judgment([0, 1, 2, 3, 4])));
  await expect(generateVerifiedNews({ ...source, body: `${body}\n단체 보험은 5000만 원을 보장합니다.` }))
    .resolves.toHaveProperty('answer', corrected.answer);
  expect(mock.call.mock.calls[1][0].responseSchema.name).toBe('policy_news_draft');
  expect(mock.call).toHaveBeenCalledTimes(3);
});

// Value: protects=본문 개수에 따라 달라지는 판정 개수와 부분 번호 계약;
// fails_when=판정 개수나 부분 번호를 네 부분 기사 기준으로 고정함;
// why_new=기존 형식 검사는 본문 네 부분만 사용함; seam=none
it.each([3, 4, 6])('본문 %i부분은 핵심 안내를 포함한 정확한 판정 개수와 번호를 요구한다', async count => {
  const sections = [...draft.sections,
    { heading: '상담에서 물어볼 사항', paragraphs: ['기관에 문의할 때는 발표 내용과 자신의 상황을 비교한 결과를 바탕으로 질문할 수 있습니다. 원문에 없는 조건을 실제 의무처럼 덧붙이지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '개별 결과의 해석', paragraphs: ['다른 사람의 사례는 개인에게 같은 지원 결과를 보장하지 않습니다. 실제 지급 결정과 발표에서 확인한 대상 안내를 따로 정리하면 혼동을 줄일 수 있습니다.'], quoteIndex: 0, caseIndex: -1 },
  ].slice(0, count);
  const parts = Array.from({ length: count + 1 }, (_, part) => part);
  mock.call.mockResolvedValueOnce(JSON.stringify({ ...draft, sections })).mockResolvedValueOnce(JSON.stringify(judgment(parts)));
  await expect(generateVerifiedNews(source)).resolves.toHaveProperty('editorialReview');
  const checks = mock.call.mock.calls[1][0].responseSchema.schema.properties.checks;
  expect(checks.minItems).toBe(count + 1); expect(checks.maxItems).toBe(count + 1);
  expect(checks.items.anyOf.map((item: { properties: { part: { enum: number[] } } }) => item.properties.part.enum[0])).toEqual(parts);
  expect(checks.items.anyOf.every((item: { properties: { quoteIndex: { enum: number[] } } }) =>
    JSON.stringify(item.properties.quoteIndex.enum) === JSON.stringify([-1, 0]))).toBe(true);
  expect(mock.call).toHaveBeenCalledTimes(2);
});
// Value: protects=여러 원문 근거의 전체 번호 목록과 마지막 근거 연결 계약;
// fails_when=첫 원문 번호만 허용하거나 마지막 근거 번호를 누락함;
// why_new=기존 형식 검사는 원문 근거 하나만 사용함; seam=none
it.each([2, 3])('원문 근거 %i개 중 본문에 연결한 마지막 근거로 사실을 대조한다', async count => {
  const quotes = [body, '지원 확정 여부는 담당 기관이 따로 판단합니다.', '신청 대상이라는 설명과 실제 지급 결과는 구분됩니다.'].slice(0, count);
  const review = judgment([0, 1, 2, 3, 4]);
  review.checks.forEach(check => { check.quoteIndex = count - 1; });
  const linked = { ...draft, sections: draft.sections.map(section => ({ ...section, quoteIndex: count - 1 })) };
  mock.call.mockResolvedValueOnce(JSON.stringify(linked)).mockResolvedValueOnce(JSON.stringify(review));
  await expect(generateVerifiedNews({ ...source, body: quotes.join('\n') })).resolves.toHaveProperty('editorialReview');
  const checks = mock.call.mock.calls[1][0].responseSchema.schema.properties.checks;
  expect(checks.items.anyOf[0].properties.quoteIndex.enum).toEqual([-1, ...quotes.map((_, index) => index)]);
  expect(checks.items.anyOf[1].properties.quoteIndex.enum).toEqual([-1, count - 1]);
  const example = JSON.parse(mock.call.mock.calls[1][0].prompt.split('검사 응답 형식: ')[1]);
  expect(example.checks.slice(1).map((check: { quoteIndex: number }) => check.quoteIndex)).toEqual(draft.sections.map(() => count - 1));
  expect(mock.call).toHaveBeenCalledTimes(2);
});
it.each([[0, 1, 2, 3], [0, 1, 2, 3, 3], [0, 1, 2, 3, 5]])('형식 우회한 누락·중복·범위 밖 판정은 서버에서 보류한다: %j', async (...parts) => {
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify(judgment(parts)));
  await expect(generateVerifiedNews(source)).rejects.toThrow('별도 사실 대조');
});
it('허용 범위 밖 원문 번호는 합격 표시가 있어도 보류한다', async () => {
  const invalid = judgment([0, 1, 2, 3, 4]); invalid.checks[4].quoteIndex = 99;
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify(invalid));
  await expect(generateVerifiedNews(source)).rejects.toThrow('별도 사실 대조');
});
it.each([true, false])('같은 금액만 원문 표기로 복원하고 다른 금액은 재작성 후에도 보류한다: %s', corrected => {
  const invalid = structuredClone(draft);
  invalid.sections[1].paragraphs[0] = '단체 보험 보장 한도는 5천만 원입니다. 최고 한도는 누구나 같은 금액을 받는다는 의미가 아니므로, 개인별 지급 여부와 보장 항목을 구분해 읽어야 합니다. 원문에서 확인된 금액 표기를 보존하세요.';
  if (!corrected) invalid.sections[1].paragraphs[0] = invalid.sections[1].paragraphs[0].replace('5천', '6천');
  const fixedText = invalid.sections[1].paragraphs[0].replace('5천만 원', '5000만 원');
  mock.call.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(
    corrected ? judgment([0, 1, 2, 3, 4]) : invalid));
  const outcome = generateVerifiedNews({ ...source, body: `${body}\n단체 보험은 5000만 원을 보장합니다.` });
  return (corrected ? expect(outcome).resolves.toHaveProperty('sections.1.paragraphs.0', fixedText)
    : expect(outcome).rejects.toThrow('확인하지 못한 숫자')).then(() => {
    expect(mock.call).toHaveBeenCalledTimes(2);
    expect(mock.call.mock.calls[1][0].responseSchema.name).toBe(corrected ? 'policy_news_judgment' : 'policy_news_draft');
  });
});

// 보호 대상: 공개 문장의 금액만 복원하고 원문 인용·위치 번호·정상 문장·입력 객체를 보존합니다.
it.each(['5000만 원', '50,000,000원', '0.5억 원'])('원문의 유일한 동액 표기 %s를 모든 공개 위치에 복원한다', original => {
  const input = structuredClone(draft);
  for (const field of ['title', 'question', 'answer', 'audience'] as const) input[field] += ' 5천 만 원';
  input.sections[0].heading += ' 5천만 원';
  input.sections[0].paragraphs[0] += ' 5천만 원';
  const snapshot = JSON.stringify(input);
  const result = restoreSourceAmounts(input, `${body} 한도는 ${original}입니다. ${original} 한도입니다.`) as typeof input;
  for (const field of ['title', 'question', 'answer', 'audience'] as const) expect(result[field]).toBe(input[field].replace('5천 만 원', original));
  expect(result.sections[0].paragraphs[0]).toBe(input.sections[0].paragraphs[0].replace('5천만 원', original));
  expect(result.sections[0].heading).toBe(input.sections[0].heading.replace('5천만 원', original));
  expect(result.sections[0].quoteIndex).toBe(input.sections[0].quoteIndex);
  expect(result.sections.slice(1)).toEqual(input.sections.slice(1));
  expect(JSON.stringify(input)).toBe(snapshot);
});
it.each(['-5천만 원', '+5천만 원', '1억 5천만 원', '15천만 원'])('초안의 부호·복합금액·긴 숫자 %s를 다른 금액으로 복원하지 않는다', amount => {
  const input = { ...draft, answer: `지원 한도는 ${amount}입니다.` };
  expect(restoreSourceAmounts(input, '5000만 원')).toEqual(input);
});
it.each(['1억 5000만 원', '-5000만 원', '4999.9999999999999999만 원'])('실제 작성에서도 안전하지 않은 원문 %s로 부분 금액 수정을 권하지 않는다', async amount => {
  const input = { ...draft, answer: '지원 금액은 5천만 원이며 개인별 지급 결정과 구분합니다.' };
  mock.call.mockResolvedValueOnce(JSON.stringify(input)).mockResolvedValueOnce(JSON.stringify(input));
  await expect(generateVerifiedNews({ ...source, body: `${body} 지원 금액은 ${amount}입니다.` })).rejects.toThrow('확인하지 못한 숫자');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[1][0].responseSchema.name).toBe('policy_news_draft');
  expect(mock.call.mock.calls[1][0].prompt).not.toContain('5천만원 →');
});
it.each(['-5천만 원', '+5천만 원', '1억 5천만 원'])('실제 작성의 부호·복합금액 %s를 수정 안내가 우회하지 못한다', async amount => {
  const input = { ...draft, answer: `지원 금액은 ${amount}이며 개인별 지급 결정과 구분합니다.` };
  mock.call.mockResolvedValueOnce(JSON.stringify(input)).mockResolvedValueOnce(JSON.stringify(input));
  await expect(generateVerifiedNews({ ...source, body: `${body} 지원 금액은 5000만 원입니다.` })).rejects.toThrow('확인하지 못한 숫자');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[1][0].responseSchema.name).toBe('policy_news_draft');
  expect(mock.call.mock.calls[1][0].prompt).not.toContain('5천만원 →');
});
it('지원하지 않는 큰 복합 단위의 일부를 독립 금액으로 복원하지 않는다', () => {
  const input = { ...draft, answer: '총예산은 50000천만 원입니다.' };
  expect(restoreSourceAmounts(input, '총예산은 1조 5000억 원입니다.')).toEqual(input);
});
it.each(['2026-10-06', '2026-02-30', '2026-13-01', undefined])('정상 발표연도 근거만 부분 숫자 수정 경로에 허용한다: %s', publishedAt => {
  const input = { sections: [{ heading: '인원 안내', paragraphs: ['2026년 행사에는 70명이 참석했습니다.'] }] };
  const plan = makeCopyRepair(input, '행사에는 70여 명이 참석했습니다.',
    '원문에서 확인하지 못한 숫자: 70명. 원문 숫자와 단위를 함께 쓰세요: 70명 → 70여명.', publishedAt);
  if (publishedAt === '2026-10-06') expect(plan?.targets.map(target => target.text)).toEqual(input.sections[0].paragraphs);
  else expect(plan).toBeNull();
});
it.each(['5000만 원과 0.5억 원', '6000만 원', '5천만 원', '9007199260000000원',
  '1억 5000만 원', '1억 원 5000만 원', '-5000만 원', '− 5000만 원', '4999.9999999999999999만 원'])('다른 금액·여러 표기·이미 같은 표기는 추측해 바꾸지 않는다: %s', amounts => {
  const input = { ...draft, answer: '5천만 원과 2024년의 안내를 비교합니다.' };
  expect(restoreSourceAmounts(input, amounts)).toEqual(input);
});
// 보호 대상: 오류 요약의 세 숫자 뒤에 숨은 미확인 연도도 전체 수정 경로로 보냅니다.
it('오류 안내에 연도가 생략되어도 본문 전체 숫자를 확인한다', () => {
  const input = { sections: [{ heading: '금액 안내', paragraphs: ['5000, 5000, 5000 안내는 2027년부터입니다.'] }] };
  expect(makeCopyRepair(input, '지원 금액은 5000만원입니다.',
    '원문에서 확인하지 못한 숫자: 5000, 5000, 5000. 원문 숫자와 단위를 함께 쓰세요: 5000 → 5000만원.')).toBeNull();
});
it('정밀도가 보장되지 않는 큰 금액과 소수 천만원은 변환하지 않는다', () => {
  const input = { ...draft, answer: '900719926천만원과 1.5천만원은 그대로 검사합니다.' };
  expect(restoreSourceAmounts(input, '9007199260000000원과 1500만원')).toEqual(input);
});
it('인용문은 공개 금액 표기 복원 대상이 아니다', () => {
  const input = { sections: [{ heading: '금액 안내', paragraphs: ['5천만 원입니다.'], quote: '5천만 원입니다.', quoteIndex: 7 }] };
  expect(restoreSourceAmounts(input, '5000만 원') as typeof input).toHaveProperty('sections.0.quote', '5천만 원입니다.');
});
it.each([null, [], { sections: [null] }, { sections: [{ paragraphs: [1] }] }])('잘못된 초안 구조는 복원하지 않는다: %j', input => {
  expect(restoreSourceAmounts(input, '5000만원')).toBe(input);
});
it('숫자 오류가 제목에 있거나 원문 표기를 특정할 수 없으면 본문만 수정하지 않는다', () => {
  const input = { ...draft, answer: '70명 지원 안내를 비교합니다.' };
  const issue = '원문에서 확인하지 못한 숫자: 70명. 원문 숫자와 단위를 함께 쓰세요: 70명 → 70여명.';
  expect(makeCopyRepair(input, body, issue)).toBeNull();
  expect(makeCopyRepair(draft, body, '원문에서 확인하지 못한 숫자: 2024년.')).toBeNull();
});
it('같은 금액을 복원해도 별도 사실 판정이 실패하면 공개하지 않는다', async () => {
  const input = { ...draft, answer: '단체 보험 한도는 5천만 원이며 개인별 지급은 별도입니다.' };
  mock.call.mockResolvedValueOnce(JSON.stringify(input)).mockResolvedValueOnce(JSON.stringify({ ...judgment([0, 1, 2, 3, 4]), supported: false }));
  await expect(generateVerifiedNews({ ...source, body: `${body} 단체 보험 한도는 5000만 원입니다.` })).rejects.toThrow('별도 사실 대조');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
