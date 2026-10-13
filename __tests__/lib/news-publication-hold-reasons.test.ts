import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn(), fixedError: false }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
vi.mock('@/lib/news-publication/fixed-cases', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/news-publication/fixed-cases')>();
  return { ...actual, fixedCaseSourceIssue: (...args: Parameters<typeof actual.fixedCaseSourceIssue>) =>
    mock.fixedError || actual.fixedCaseSourceIssue(...args) };
});
import { generateVerifiedNews } from '@/lib/news-publication/generate';
import { NewsDraftError } from '@/lib/news-publication/errors';
import { sourceCheckIssue } from '@/lib/news-publication/source-check-issue';
afterEach(() => { mock.call.mockReset(); mock.fixedError = false; });

const body = '청년 근로자가 신청할 수 있습니다.';
const draft = { kind: 'application', title: '신청 대상과 실제 지원 확정의 차이',
  question: '대상에 해당하면 바로 지원이 확정되나요?', answer: '신청 대상이라는 설명과 개인별 지원 결정은 구분해야 합니다.', audience: '청년 근로자',
  sections: [
    { heading: '원문의 대상 안내', paragraphs: ['대상으로 안내됐다는 사실은 최종 지급 결정을 뜻하지 않습니다. 원문에서 확인된 신청 범위와 개인의 상황을 나누어 읽어야 합니다. 추가 자격 조건을 만들어 설명하지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '신청과 선정 구분', paragraphs: ['키피오의 제안: 현재 접수 가능 여부를 담당 창구에 확인하세요. 실제 안내에 있는 조건을 자신의 상황과 비교한 뒤 신청 여부를 판단할 수 있습니다. 개인별 선정 결과를 이 기사에서 확정할 수는 없습니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '지원 내용의 확인 범위', paragraphs: ['이 원문만으로 지원 금액과 지급 시점을 특정할 수 없습니다. 알려진 대상 범위와 확인할 수 없는 세부 조건을 나누어 판단해야 합니다. 신청 설명을 심사가 필요 없다는 뜻으로 바꾸지 않습니다.'], quoteIndex: 0, caseIndex: -1 },
  ] };
const source = { title: '공식 신청 안내', body, hash: '원문 식별값', publishedAt: '2026-10-06',
  url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915' };
const judgment = { supported: true, originalValue: true, issues: [],
  quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
    .map(key => [key, { passed: true, reason: '대상 안내와 개인별 지원 결정을 구분하는 해설이 있습니다.', excerptIndex: 0 }])),
  checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) };

// 전체 통과 표시가 있어도 빠진 본문 검사를 보류하고 정확한 위치를 기록해야 합니다.
it('판정 개수가 부족하면 누락된 본문 번호를 보류 기록에 남긴다', async () => {
  const partial = { ...judgment, checks: judgment.checks.slice(0, 3) };
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify(partial));
  const error = await generateVerifiedNews(source).catch(value => value);
  expect(error).toBeInstanceOf(NewsDraftError);
  expect(error.message).toContain('검사 결과 개수: 필요 4개, 수신 3개');
  expect(error.message).toContain('누락: 본문 3');
  expect(error.evidence.judgment.checks).toHaveLength(3);
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it.each([
  ['중복', [0, 1, 2, 2], '누락: 본문 3'],
  ['범위 밖', [0, 1, 2, 9], '누락: 본문 3'],
  ['핵심 안내 누락', [1, 2, 3], '누락: 제목·핵심 안내'],
  ['과다 응답', [0, 1, 2, 3, 3], '필요 4개, 수신 5개'],
] as const)('%s 결과는 공개하지 않고 개수와 누락을 기록한다', async (_, parts, reason) => {
  const checks = parts.map(part => ({ part, supported: true, quoteIndex: 0 }));
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ ...judgment, checks }));
  await expect(generateVerifiedNews(source)).rejects.toThrow(reason);
  if (parts.length > 4) {
    expect(sourceCheckIssue(checks.map(check => ({ ...check, quote: body })), 3, body))
      .toContain('중복·범위 밖 번호를 확인하세요.');
  }
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it.each([
  ['사실 불일치', { supported: false }, '본문 2의 사실 확인'],
  ['잘못된 근거 번호', { quoteIndex: 9 }, '본문 2의 원문 근거 번호'],
] as const)('%s를 해당 본문 번호로 안내하고 공개하지 않는다', async (_, patch, reason) => {
  const checks = judgment.checks.map(check => check.part === 2 ? { ...check, ...patch } : check);
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ ...judgment, checks }));
  await expect(generateVerifiedNews(source)).rejects.toThrow(reason);
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it.each([null, undefined, {}])('검사 목록 누락은 명확한 사유로 보류한다: %j', value => {
  expect(sourceCheckIssue(value, 3, body)).toBe('검사 결과 목록이 없습니다.');
});
it.each([
  ['짧은 근거', '인용 길이가 맞지 않습니다.'],
  ['가'.repeat(301), '인용 길이가 맞지 않습니다.'],
  ['공식 원문에 없는 다른 기관의 신청 안내입니다.', '인용이 공식 원문과 일치하지 않습니다.'],
])('인용 길이와 원문 불일치는 해당 실패 설명을 남긴다: %s', (quote, reason) => {
  const checks = [0, 1, 2, 3].map(part => ({ part, supported: true, quote: part === 1 ? quote : body }));
  expect(sourceCheckIssue(checks, 3, body)).toContain('본문 1');
  expect(sourceCheckIssue(checks, 3, body)).toContain(reason);
});
it('정상 근거의 공백 차이는 허용하고 원본 검사 결과를 바꾸지 않는다', () => {
  const checks = [0, 1, 2, 3].map(part => ({ part, supported: true, quote: body.replace(' ', '\n') }));
  const before = JSON.stringify(checks);
  expect(sourceCheckIssue(checks, 3, body)).toBeNull();
  expect(JSON.stringify(checks)).toBe(before);
});
it.each([{ supported: false }, { originalValue: false }, { issues: ['원문과 다른 상태를 설명했습니다.'] },
  { issues: undefined }, { issues: {} }])('모든 부분이 통과해도 전체 판정 실패는 계속 보류한다: %j', async patch => {
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ ...judgment, ...patch }));
  await expect(generateVerifiedNews(source)).rejects.toThrow('별도 사실 대조');
});
it('모든 사실 판정이 통과해도 독자 품질 검사 실패는 계속 보류한다', async () => {
  const quality = { ...judgment.quality, usefulness: { ...judgment.quality.usefulness, passed: false } };
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ ...judgment, quality }));
  await expect(generateVerifiedNews(source)).rejects.toThrow('독자 관점 품질');
});
// 고정 사례 검사의 실패를 주입해 오류 설명 연결만 검증합니다. 실제 사례 추출은 기존 시험이 담당합니다.
it('고정 사례 근거 검사 실패는 참·거짓 대신 한국어 설명으로 보류한다', async () => {
  mock.fixedError = true;
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify(judgment));
  const error = await generateVerifiedNews(source).catch(value => value);
  expect(error).toBeInstanceOf(NewsDraftError);
  expect(error.message).toContain('고정 참가 사례·현장 설명의 원문 근거 번호가 맞지 않습니다.');
  expect(error.message).not.toContain('true');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
