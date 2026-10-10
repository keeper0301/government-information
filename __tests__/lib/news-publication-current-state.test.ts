import { afterEach, expect, it, vi } from 'vitest';
import { newsDraftIssue, type NewsDraft } from '@/lib/news-publication/validation';
import { currentStateIssue } from '@/lib/news-publication/current-state';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const quote = '양국은 공동 교육과정 개발을 지원하고 정책 교류를 추진한다.';
const body = `${quote}\n협력 우선 분야를 명시하도록 양해각서를 개정했다.`;
const draft: NewsDraft = {
  kind: 'change', title: '고등교육 협력 개정과 실제 사업 운영의 차이',
  question: '협력 발표만으로 실제 운영 상태를 확인할 수 있나요?',
  answer: '협력 분야를 정한 발표와 실제 사업 운영 상태는 구분해서 읽어야 합니다. 원문은 공동 교육과정 개발과 정책 교류의 추진 방향을 소개합니다.',
  audience: '고등교육 협력에 관심 있는 시민', sections: [
    { heading: '협력 분야의 변화', quote, paragraphs: ['이번 발표는 기관 사이에서 함께 다룰 협력 분야를 정리한 내용입니다. 협력의 방향을 명시한 사실과 실제 교육과정이 운영된다는 사실은 서로 다르므로 발표의 범위를 구분해서 읽어야 합니다.'] },
    { heading: '공동 교육과정의 범위', quote, paragraphs: ['교육과정 개발을 지원한다는 방침은 개별 대학의 교육과정 운영을 보장하지 않습니다. 발표된 협력 방향을 개인의 수강 가능 여부로 확대하지 않고 원문의 설명 범위를 보존합니다.'] },
    { heading: '협력의 현재 상태', quote, paragraphs: ['현시점에서 개정 양해각서는 정식 채택되어 시행 중이다.'] },
  ],
};

// 원문에 시행 예정 부제가 없어도 현재 시행 단정은 근거가 필요합니다.
it('협력 개정 발표만으로 현재 시행 중이라고 쓴 실제 실패 유형을 보류한다', () => {
  expect(newsDraftIssue(draft, body)).toContain('시행 상태');
});

const corrected = () => {
  const value = structuredClone(draft);
  value.sections[2].paragraphs = ['원문은 협력 분야와 추진 방향을 소개합니다. 이 발표만으로 각 대학의 실제 교육과정 운영 상태를 확정할 수 없습니다.'];
  return value;
};

it('시행 단정을 제거한 정상 해설은 기존 전체 검사를 통과한다', () => {
  expect(newsDraftIssue(corrected(), body)).toBeNull();
});

it.each(['시행 중이다', '시행중입니다', '시행되고 있다', '시행하고 있습니다', '시행 중인 제도입니다'])('원문 밖 현재 상태 %s를 보류한다', state => {
  const value = corrected(); value.sections[2].paragraphs = [`개정 양해각서는 ${state}.`];
  expect(currentStateIssue(value, body)).toContain('시행 상태');
});

it.each(['제도는 시행 중이다.', '현재 제도는 시행 중입니다.', '제도는 시행되고 있습니다.', '제도는 시행하고 있다.'])('주체와 시행 절이 원문에 직접 있으면 표현 %s를 허용한다', text => {
  const value = corrected(); value.sections[2].paragraphs = [text];
  expect(currentStateIssue(value, `${body}\n제도는 시행 중이다.`)).toBeNull();
});

it.each(['기존 사업은 시행 중이다.', '개정 양해각서는 시행 중이 아니다.',
  '개정 양해각서는 시행 중인지 확인하지 못했다.', '내년 개정 양해각서는 시행 중일 예정이다.'])('다른 사업·부정·미확인·예정 원문 %s로 근거를 빌리지 않는다', sourceState => {
  expect(currentStateIssue(draft, `${body}\n${sourceState}`)).toContain('시행 상태');
});

it.each(['제도는 시행 중이 아닙니다.', '제도는 시행 중이라는 뜻은 아닙니다.',
  '제도는 시행 중인가요?', '제도는 시행 중이라면 별도 조건을 살펴봅니다.',
  '제도는 시행 중으로 단정할 수 없습니다.', '제도는 시행되고 있지 않습니다.',
  '제도는 시행 중인지 미확인입니다.', '제도는 시행 중일 예정이다.',
  '제도는 시행 중단 상태입니다.'])('직접 붙은 부정·질문·가정 %s는 시행 합격 근거가 아닌 설명으로 구분한다', text => {
  const value = corrected(); value.sections[2].paragraphs = [text];
  expect(currentStateIssue(value, body)).toBeNull();
});

it('원문에 주체 없는 시행 상태가 있어도 초안의 주체 없는 시행 단정은 보류한다', () => {
  const value = corrected(); value.sections[2].paragraphs = ['시행 중입니다.'];
  expect(currentStateIssue(value, '시행 중입니다.')).toContain('시행 상태');
});

it('다음 문장의 부정으로 앞 문장의 시행 단정을 덮지 않는다', () => {
  const value = corrected(); value.sections[2].paragraphs = ['개정 양해각서는 시행 중입니다. 지원 확정이라는 뜻은 아닙니다.'];
  expect(currentStateIssue(value, body)).toContain('시행 상태');
});

it('시행 여부를 확인했다는 단정도 원문 근거 없이 통과하지 않는다', () => {
  const value = corrected(); value.sections[2].paragraphs = ['개정 양해각서는 시행 중인지 확인됐습니다.'];
  expect(currentStateIssue(value, body)).toContain('시행 상태');
});

it('접속 문장으로 이어진 시행 설명은 보수적으로 보류한다', () => {
  const value = corrected(); value.sections[2].paragraphs = ['제도는 시행 중입니다.'];
  expect(currentStateIssue(value, '제도는 시행 중이며 향후 지원 확대를 계획한다.')).toContain('시행 상태');
});

it.each(['현재 제도는 시행 중인데 어떻게 신청하나요?', '현재 제도는 시행 중입니다, 신청 가능한가요?'])('시행 단정과 질문이 섞인 %s도 원문 확인이 필요하다', text => {
  const value = corrected(); value.sections[2].paragraphs = [text];
  expect(currentStateIssue(value, body)).toContain('시행 상태');
});

it.each(['제도는 시행 중이었다.', '제도는 시행 중이라고 잘못 알려졌다.',
  '제도는 시행 중인 상태를 목표로 한다.', '제도는 시행 중이며 실제로는 그렇지 않다.',
  '“제도는 시행 중이며 신청은 온라인에서 받는다”고 가정해 보자.',
  '“제도는 시행 중이며 지원금이 지급된다”는 설명은 사실과 다르다.',
  '“제도는 시행 중이다.”라는 설명은 사실과 다르다.'])('과거·오보·목표·정정 원문 %s는 현재 시행 근거가 아니다', source => {
  const value = corrected(); value.sections[2].paragraphs = ['현재 제도는 시행 중이다.'];
  expect(currentStateIssue(value, source)).toContain('시행 상태');
});

it.each(['title', 'question', 'answer', 'audience', 'heading', 'paragraph'] as const)('공개 위치 %s의 미확인 시행 단정도 보류한다', field => {
  const value = corrected(); const claim = '개정 양해각서는 시행 중입니다.';
  if (field === 'heading') value.sections[0].heading = claim;
  else if (field === 'paragraph') value.sections[0].paragraphs[0] = claim;
  else value[field] = claim;
  expect(currentStateIssue(value, body)).toContain('시행 상태');
});

it('부제 없는 실제 작성 경로에서도 같은 오류를 재작성 후 반복하면 사실 검사 호출 전에 보류한다', async () => {
  const invalid = { ...draft, sections: draft.sections.map(section => ({ ...section, quoteIndex: 0, caseIndex: -1 })) };
  mock.call.mockResolvedValue(JSON.stringify(invalid));
  await expect(generateVerifiedNews({ title: '공식 협력 발표', body, hash: '확인 자료', publishedAt: '2026-10-08',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973216' })).rejects.toThrow('시행 상태');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls.every(([input]) => input.responseSchema.name === 'policy_news_draft')).toBe(true);
});

it('기존 한 번 재작성에서 단정을 제거하면 전체 검사와 별도 사실·품질 대조를 유지한다', async () => {
  const withIndexes = (value: NewsDraft) => ({ ...value, sections: value.sections.map(section => ({ ...section, quoteIndex: 0, caseIndex: -1 })) });
  mock.call.mockResolvedValueOnce(JSON.stringify(withIndexes(draft))).mockResolvedValueOnce(JSON.stringify(withIndexes(corrected())))
    .mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
        .map(key => [key, { passed: true, reason: '협력 추진 방향과 실제 운영 상태를 구분한 해설입니다.', excerptIndex: 0 }])),
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) }));
  await expect(generateVerifiedNews({ title: '공식 협력 발표', body, hash: '확인 자료', publishedAt: '2026-10-08',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973216' })).resolves.toHaveProperty('editorialReview');
  expect(mock.call).toHaveBeenCalledTimes(3);
});
