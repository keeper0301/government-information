import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
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
  expect(checks.items.properties.part.enum).toEqual(parts);
  expect(checks.items.properties.quoteIndex.enum).toEqual([-1, 0]);
  expect(mock.call).toHaveBeenCalledTimes(2);
});
// Value: protects=여러 원문 근거의 전체 번호 목록과 마지막 근거 연결 계약;
// fails_when=첫 원문 번호만 허용하거나 마지막 근거 번호를 누락함;
// why_new=기존 형식 검사는 원문 근거 하나만 사용함; seam=none
it.each([2, 3])('원문 근거 %i개의 모든 번호를 허용하고 마지막 근거로 사실을 대조한다', async count => {
  const quotes = [body, '지원 확정 여부는 담당 기관이 따로 판단합니다.', '신청 대상이라는 설명과 실제 지급 결과는 구분됩니다.'].slice(0, count);
  const review = judgment([0, 1, 2, 3, 4]);
  review.checks.forEach(check => { check.quoteIndex = count - 1; });
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify(review));
  await expect(generateVerifiedNews({ ...source, body: quotes.join('\n') })).resolves.toHaveProperty('editorialReview');
  const checks = mock.call.mock.calls[1][0].responseSchema.schema.properties.checks;
  expect(checks.items.properties.quoteIndex.enum).toEqual([-1, ...quotes.map((_, index) => index)]);
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
it.each([true, false])('금액 수정 안내는 해당 문단만 한 번 고치고 숫자·별도 사실 검사를 유지한다: %s', corrected => {
  const invalid = structuredClone(draft);
  invalid.sections[1].paragraphs[0] = '단체 보험 보장 한도는 5천만 원입니다. 최고 한도는 누구나 같은 금액을 받는다는 의미가 아니므로, 개인별 지급 여부와 보장 항목을 구분해 읽어야 합니다. 원문에서 확인된 금액 표기를 보존하세요.';
  const fixedText = invalid.sections[1].paragraphs[0].replace('5천만 원', corrected ? '5000만 원' : '6천만 원');
  mock.call.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify({ edits: { paragraph_0: fixedText } }));
  if (corrected) mock.call.mockResolvedValueOnce(JSON.stringify(judgment([0, 1, 2, 3, 4])));
  const outcome = generateVerifiedNews({ ...source, body: `${body}\n단체 보험은 5000만 원을 보장합니다.` });
  return (corrected ? expect(outcome).resolves.toHaveProperty('sections.1.paragraphs.0', fixedText)
    : expect(outcome).rejects.toThrow('확인하지 못한 숫자')).then(() => {
    expect(mock.call).toHaveBeenCalledTimes(corrected ? 3 : 2);
    const repair = mock.call.mock.calls[1][0];
    expect(repair.responseSchema.schema.properties.edits.required).toEqual(['paragraph_0']);
    expect(repair.prompt).toContain('5천만원 → 5000만원');
  });
});
