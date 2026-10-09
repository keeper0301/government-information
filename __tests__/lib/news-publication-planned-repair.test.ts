import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
import { makePlannedRepair, applyPlannedRepair } from '@/lib/news-publication/planned-repair';
afterEach(() => mock.call.mockReset());

const body = '청년 보험 개선방안\n내년 7월부터 본격 시행 예정\n정부는 군 복무 청년 보험을 도입할 예정입니다.';
const source = { title: '청년 보험 개선방안', body, hash: '원문 식별값', publishedAt: '2026-10-06',
  url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915' };
const draft = { kind: 'change', title: '군 복무 청년 보험 도입 예정과 적용 상태',
  question: '발표한 보험은 지금 이용할 수 있나요?', answer: '정부는 군 복무 청년에게 보험을 도입합니다.', audience: '군 복무 청년',
  sections: [
    { heading: '발표와 시행 구별', paragraphs: ['이번 발표는 보험 도입을 준비하는 내용입니다. 발표와 실제 시행을 구별하면 현재 이용 가능한 혜택으로 혼동하는 일을 줄일 수 있습니다. 원문에 없는 접수 방법이나 개인별 지급 결과를 확정할 수 없습니다.'], quoteIndex: 2, caseIndex: -1 },
    { heading: '적용 상태 읽기', paragraphs: ['정부는 군 복무 청년에게 보험을 도입합니다. 제도에 대한 발표와 개인이 실제로 보장을 받는 시점은 구별해서 읽어야 합니다. 세부 자격은 이 기사만으로 추가해서 안내하지 않습니다.'], quoteIndex: 2, caseIndex: -1 },
    { heading: '독자가 판단할 기준', paragraphs: ['원문은 군 복무 청년 보험 도입을 예고했습니다. 발표에서 확인한 대상 범위와 자신의 상황을 나누어 읽으면 지원이 이미 확정됐다는 오해를 줄일 수 있습니다. 실제 보장 여부는 개인별 결과와 구별해야 합니다.'], quoteIndex: 2, caseIndex: -1 },
  ] };
const answer = '정부는 군 복무 청년 보험을 도입할 예정입니다. 발표와 실제 이용 가능 상태를 구별해야 합니다.';
const paragraph = draft.sections[1].paragraphs[0].replace('도입합니다.', '도입할 예정입니다.');
const judgment = { supported: true, originalValue: true, issues: [],
  quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
    .map(key => [key, { passed: true, reason: '발표와 실제 이용 상태를 구별하는 구체적인 설명이 있습니다.', excerptIndex: 0 }])),
  checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 2 })) };

// 보호: 첫 답변과 본문 오류의 동시 수정, 정상 필드 유지, 수정 후 별도 검사.
// 실패 조건: 전체 재작성으로 돌아가거나 오류 위치를 빠뜨리거나 검사를 생략함.
// Value: protects=예정 오류 위치 수정과 전체 검사 연결; fails_when=전체 재작성 또는 검사 생략;
// why_new=기존 예정 시험은 기사 전체 응답만 사용함; seam=none
it('예정 상태가 빠진 답변과 문단만 고치고 정상 내용과 별도 검사를 유지한다', async () => {
  mock.call.mockResolvedValueOnce(JSON.stringify(draft))
    .mockResolvedValueOnce(JSON.stringify({ edits: { answer, paragraph_1_0: paragraph } }))
    .mockResolvedValueOnce(JSON.stringify(judgment));
  const result = await generateVerifiedNews(source);
  expect(result.answer).toBe(answer);
  expect(result.title).toBe(draft.title);
  expect(result.sections[0].paragraphs).toEqual(draft.sections[0].paragraphs);
  expect(result.sections[1].paragraphs).toEqual([paragraph]);
  expect(mock.call.mock.calls[1][0].responseSchema.schema.properties.edits.required).toEqual(['answer', 'paragraph_1_0']);
  expect(mock.call).toHaveBeenCalledTimes(3);
});

// 보호: 제목·질문·대상·소제목도 같은 검사로 위치를 찾고 정상 필드는 변경하지 않음.
// Value: protects=공개 필드별 실제 수정 반영과 정상 내용 보존; fails_when=소제목 대입 누락;
// why_new=답변과 문단 시험은 소제목 대입 분기를 지나지 않음; seam=none
it('모든 공개 필드의 오류 위치를 함께 지정하고 근거와 정상 문단을 유지한다', () => {
  const invalid = structuredClone(draft);
  invalid.title = '군 복무 청년 보험 도입 안내';
  invalid.question = '현재 군 복무 청년에게 보험을 지원합니다.';
  invalid.audience = '이미 보험이 도입됐습니다.';
  invalid.sections[0].heading = '청년 보험 지원이 확대됩니다.';
  const plan = makePlannedRepair(invalid, body)!;
  expect(plan.targets.map(target => target.key)).toEqual(['title', 'question', 'answer', 'audience', 'heading_0', 'paragraph_1_0']);
  const edits = Object.fromEntries(plan.targets.map(target => [target.key, '보험은 도입 예정입니다.']));
  const result = applyPlannedRepair(invalid, { edits }, plan) as typeof draft;
  expect([result.title, result.question, result.answer, result.audience, result.sections[0].heading])
    .toEqual(Array(5).fill('보험은 도입 예정입니다.'));
  expect(result.sections[0].paragraphs).toEqual(draft.sections[0].paragraphs);
  expect(result.sections.map(section => [section.quoteIndex, section.caseIndex]))
    .toEqual(draft.sections.map(section => [section.quoteIndex, section.caseIndex]));
  expect(invalid.answer).toBe(draft.answer);
});
it('원문에 그대로 있는 기존 지원과 직접 부정한 안내는 수정 대상으로 잡지 않는다', () => {
  const invalid = structuredClone(draft);
  invalid.sections[0].paragraphs[0] = '현재 기존 제도는 진료비를 지원한다. 현재 보험 지원을 받을 수 있다는 뜻은 아닙니다.';
  const plan = makePlannedRepair(invalid, `${body}\n기존 제도는 진료비를 지원한다.`)!;
  expect(plan.targets.map(target => target.key)).toEqual(['answer', 'paragraph_1_0']);
});
it.each([null, {}, { ...draft, sections: [{}] }, { ...draft, answer: 1 }])('잘못된 초안 형식은 수정 위치를 추측하지 않는다: %j', invalid => {
  expect(makePlannedRepair(invalid, body)).toBeNull();
});
it('원문 앞 세 줄의 예정 안내가 없거나 이미 올바르면 수정 계획을 만들지 않는다', () => {
  expect(makePlannedRepair(draft, body.replace('내년 7월부터 본격 시행 예정\n', ''))).toBeNull();
  const valid = structuredClone(draft); valid.answer = answer; valid.sections[1].paragraphs[0] = paragraph;
  expect(makePlannedRepair(valid, body)).toBeNull();
});
it.each([
  { edits: { answer } },
  { edits: { answer, paragraph_1_0: paragraph, title: '다른 제목' } },
  { edits: { answer, paragraph_1_0: '' } },
  { edits: { answer: 1, paragraph_1_0: paragraph } },
  { edits: { answer, paragraph_1_0: paragraph }, sections: [] },
  { other: { answer, paragraph_1_0: paragraph } },
])('누락·다른 위치·빈 내용·틀린 응답은 적용하지 않는다: %j', reply => {
  const plan = makePlannedRepair(draft, body)!;
  expect(applyPlannedRepair(draft, reply, plan)).toBeNull();
});
it('수정할 초안이 바뀌면 오래된 수정 응답을 적용하지 않는다', () => {
  const plan = makePlannedRepair(draft, body)!;
  expect(applyPlannedRepair({ ...draft, title: '다른 초안의 제목' }, { edits: { answer, paragraph_1_0: paragraph } }, plan)).toBeNull();
});
it.each([
  ['예정 표현 누락', { answer: draft.answer, paragraph_1_0: paragraph }, '제목과 첫 답변'],
  ['새 숫자 추가', { answer: '정부는 군 복무 청년 보험을 999년 동안 도입할 예정입니다.', paragraph_1_0: paragraph }, '확인하지 못한 숫자'],
  ['다른 위치 추가', { answer, paragraph_1_0: paragraph, title: '다른 제목' }, '수정 응답의 위치나 형식'],
])('수정 응답의 %s 오류는 두 번 작성 뒤 계속 보류한다', async (_label, edits, reason) => {
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ edits }));
  await expect(generateVerifiedNews(source)).rejects.toThrow(String(reason));
  expect(mock.call).toHaveBeenCalledTimes(2);
});
it('부분 수정 후 별도 사실 검사 실패도 공개 가능 결과로 반환하지 않는다', async () => {
  mock.call.mockResolvedValueOnce(JSON.stringify(draft))
    .mockResolvedValueOnce(JSON.stringify({ edits: { answer, paragraph_1_0: paragraph } }))
    .mockResolvedValueOnce(JSON.stringify({ ...judgment, supported: false }));
  await expect(generateVerifiedNews(source)).rejects.toThrow('별도 사실 대조');
  expect(mock.call).toHaveBeenCalledTimes(3);
});
