import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const body = '중증 난치성 질환에 한해 본인부담금 50%를 지원했다.';
const draft = (answer: string) => ({ kind: 'change', title: '기존 의료비 지원의 질환 조건 확인',
  question: '기존 의료비 지원의 범위는 무엇인가요?', answer, audience: '청년 제대군인', sections: [
    { heading: '지원 범위를 비교하는 방법', quoteIndex: 0, caseIndex: -1,
      paragraphs: ['지원 비율만으로 모든 질환이 지원 대상이라고 판단하지 마세요. 키피오의 제안: 원문에 있는 질환 조건을 지원 금액과 함께 확인하세요. 조건과 지급 비율은 서로 다른 판단 기준입니다.'] },
    { heading: '개선안과 기존 제도 구별', quoteIndex: 0, caseIndex: -1,
      paragraphs: ['기존 제도의 질환 범위와 개선안의 적용 범위는 나누어 읽어야 합니다. 보험의 명칭이 비슷하다는 이유로 같은 조건이라고 추측할 수 없습니다. 실제 지원 판단은 각각의 공식 안내에 따릅니다.'] },
    { heading: '원문에 없는 내용은 추측하지 않기', quoteIndex: 0, caseIndex: -1,
      paragraphs: ['지원 설명을 읽을 때 숫자뿐 아니라 그 숫자가 적용되는 대상을 확인하세요. 원문에 없는 신청 서류나 추가 자격 조건을 만들어 안내하지 않습니다. 개인별 적용 여부는 실제 제도 조건과 대조해야 합니다.'] },
  ] });
const source = { title: '의료비 지원 조건', body, hash: '원문 식별값', publishedAt: '2026-10-06',
  url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915' };
const invalid = draft('인과성이 없으면 본인부담금 50%를 지원했다.');
const valid = draft('중증·난치성 질환에 한해 본인부담금 50%를 지원했다.');

it('질환 조건 누락을 한 번 재작성하고 별도 사실·품질 검사를 유지한다', async () => {
  const quality = Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
    .map(key => [key, { passed: true, reason: '지원 비율과 질환 조건을 구별하고 범위를 확인하는 설명입니다.', excerptIndex: 0 }]));
  mock.call.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(valid))
    .mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, issues: [], quality,
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) }));
  await expect(generateVerifiedNews(source)).resolves.toHaveProperty('editorialReview');
  expect(mock.call).toHaveBeenCalledTimes(3);
  expect(mock.call.mock.calls[1][0].prompt).toContain('원문의 중증·난치성 질환 조건을 유지하세요');
});
it('재작성 후에도 조건 누락이 남으면 두 호출에서 보류한다', async () => {
  mock.call.mockResolvedValue(JSON.stringify(invalid));
  await expect(generateVerifiedNews(source)).rejects.toThrow('질환 조건');
  expect(mock.call).toHaveBeenCalledTimes(2);
});
// Value: protects=기존 예정 오류의 수정 횟수와 별도 검사 보류; fails_when=추가 재작성 또는 검사 우회;
// why_new=기존 자료의 기사 전체 응답을 지정 위치 응답 계약으로 갱신함; seam=none
it.each([false, true])('시행 예정 오류도 같은 한 번 재작성 경로와 보류 제한을 유지한다: %s', corrected => {
  const plannedSource = { ...source, body: `내년 7월부터 본격 시행 예정\n${body}` };
  const initial = { ...valid, title: '새 보험 도입 예정과 확인 기준', answer: '새 보험을 도입합니다.' };
  const revised = { ...initial, answer: '새 보험을 도입할 예정입니다.' };
  mock.call.mockResolvedValueOnce(JSON.stringify(initial))
    .mockResolvedValueOnce(JSON.stringify({ edits: { answer: corrected ? revised.answer : initial.answer } }));
  if (corrected) mock.call.mockResolvedValueOnce(JSON.stringify({ supported: false, originalValue: false, issues: ['미확인'], checks: [] }));
  return expect(generateVerifiedNews(plannedSource)).rejects.toThrow(corrected ? '별도 사실 대조' : '시행 예정')
    .then(() => {
      expect(mock.call).toHaveBeenCalledTimes(corrected ? 3 : 2);
      expect(mock.call.mock.calls[1][0].responseSchema.schema.properties.edits.required).toEqual(['answer']);
    });
});
