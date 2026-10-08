import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { reviewFixedClaims } from '@/lib/news-publication/claim-review';
import type { NewsDraft } from '@/lib/news-publication/validation';

afterEach(() => mock.call.mockReset());
const quotes = ['참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계합니다.',
  '영업 업무를 하다 작년에 퇴직했다는 박 씨가 참석했습니다.',
  '과거 병원 행정직 경험을 살려 경력 전환을 준비 중이다.',
  '정 씨는 단기 교육이나 인턴십 연계로 확대되기를 바란다고 했습니다.'];
const draft = { answer: '참여자를 대상으로 채용 정보를 안내합니다. 대상과 시점을 구분해서 읽으세요.',
  audience: '행사 참여자', sections: [{ quote: '' }, { quote: quotes[1], paragraphs: ['키피오의 제안: 두 경력의 활용 능력을 비교해 보세요.'] },
    { sourceCase: true, quote: quotes[1], paragraphs: ['퇴직 시점은 작년입니다.'] },
    { sourceCase: true, quote: quotes[2], paragraphs: ['', '', '참가자는 단기 교육 확대를 바랐습니다. 기관이 확정한 계획은 아닙니다.'] }] } as NewsDraft;
const positive = (index: number) => ({ index, supported: true, difference: '원문의 대상·시점·발언 주체와 작성 문장이 일치합니다.' });

it.each([9, 10])('근거의 앞뒤 공백을 제외하고 최소 10자 경계를 검사한다: %s자', async length => {
  mock.call.mockImplementation(async input => {
    const claims = JSON.parse(input.prompt.split('검사할 문장: ')[1]);
    return JSON.stringify({ checks: claims.map((claim: { index: number }) => ({ ...positive(claim.index),
      ...(claim.index === 0 ? { difference: `  ${'가'.repeat(length)}  ` } : {}) })) });
  });
  if (length === 9) await expect(reviewFixedClaims(draft, quotes)).rejects.toThrow('문장별 사실 대조에서 보류됐습니다.');
  else await expect(reviewFixedClaims(draft, quotes)).resolves.toBeDefined();
  expect(mock.call).toHaveBeenCalledTimes(1);
});

it('오류 문장과 올바른 조언을 분리하고 원래 오류 표현을 검사 요청에 보존한다', async () => {
  const changed = { ...draft, answer: draft.answer.replace('참여자를', '모든 구직자를') };
  mock.call.mockImplementation(async input => {
    const claims = JSON.parse(input.prompt.split('검사할 문장: ')[1]);
    expect(claims[0].작성문장).toBe('모든 구직자를 대상으로 채용 정보를 안내합니다.');
    expect(claims[1].작성문장).toBe('대상과 시점을 구분해서 읽으세요.');
    expect(claims.some((claim: { 작성문장: string }) => claim.작성문장.includes('퇴직 시점'))).toBe(true);
    expect(claims.some((claim: { 작성문장: string }) => claim.작성문장.includes('두 경력의 활용 능력'))).toBe(false);
    return JSON.stringify({ checks: claims.map((claim: { index: number }) => ({ ...positive(claim.index),
      ...(claim.index === 0 ? { supported: false, difference: '참여자 대상 안내를 모든 구직자로 확대했습니다.' } : {}) })) });
  });
  await expect(reviewFixedClaims(changed, quotes)).rejects.toThrow('문장별 사실 대조에서 보류됐습니다.');
  expect(mock.call).toHaveBeenCalledTimes(1);
});

it.each(['누락', '중복', '잘못된 번호', '문자형 합격', '빈 근거', '공백 근거', '숫자 근거', '짧은 근거'])('불완전하거나 모순된 판정은 보류한다: %s', async kind => {
  mock.call.mockImplementation(async input => {
    const claims = JSON.parse(input.prompt.split('검사할 문장: ')[1]);
    const checks = claims.map((claim: { index: number }) => positive(claim.index));
    if (kind === '누락') checks.pop();
    if (kind === '중복') checks[1] = checks[0];
    if (kind === '잘못된 번호') checks[0].index = 999;
    if (kind === '문자형 합격') checks[0].supported = 'true';
    if (kind === '빈 근거') checks[0].difference = '';
    if (kind === '공백 근거') checks[0].difference = '             ';
    if (kind === '숫자 근거') checks[0].difference = 1234567890;
    if (kind === '짧은 근거') checks[0].difference = '  일치합니다.  ';
    return JSON.stringify({ checks });
  });
  await expect(reviewFixedClaims(draft, quotes)).rejects.toThrow('문장별 사실 대조에서 보류됐습니다.');
});

it.each([undefined, '', '   ', 7])('필수 답변이 없거나 글이 아니면 호출하지 않는다: %s', async answer => {
  await expect(reviewFixedClaims({ ...draft, answer } as unknown as NewsDraft, quotes))
    .rejects.toThrow('문장별 사실 대조의 필수 내용이 없습니다.');
  expect(mock.call).not.toHaveBeenCalled();
});

it('원문 근거가 빠졌으면 작성 도구를 부르지 않고 보류한다', async () => {
  await expect(reviewFixedClaims(draft, quotes.slice(0, 3))).rejects.toThrow('원문 근거가 없습니다.');
  expect(mock.call).not.toHaveBeenCalled();
});

it('임상 사례가 먼저 나와도 사람별 근거와 문장을 올바르게 연결한다', async () => {
  const reordered = { ...draft, sections: [draft.sections[0], draft.sections[1], draft.sections[3], draft.sections[2]] };
  const reorderedQuotes = [quotes[0], quotes[2], quotes[3], quotes[1]];
  mock.call.mockImplementation(async input => {
    const claims = JSON.parse(input.prompt.split('검사할 문장: ')[1]);
    expect(claims.find((claim: { 작성문장: string }) => claim.작성문장.includes('퇴직 시점')).원문).toBe(quotes[1]);
    expect(claims.find((claim: { 작성문장: string }) => claim.작성문장.includes('교육 확대')).원문).toBe(quotes[3]);
    return JSON.stringify({ checks: claims.map((claim: { index: number }) => positive(claim.index)) });
  });
  await expect(reviewFixedClaims(reordered, reorderedQuotes)).resolves.toBeDefined();
});
