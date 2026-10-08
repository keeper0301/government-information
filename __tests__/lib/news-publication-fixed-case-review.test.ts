import { expect, it } from 'vitest';
import { fixedCaseJudgmentSchema, fixedCaseQuality, fixedCaseReviewIssue, fixedCaseSourceIssue } from '@/lib/news-publication/fixed-case-review';
import type { FixedCases } from '@/lib/news-publication/fixed-cases';
import type { NewsDraft } from '@/lib/news-publication/validation';

// 형식 변환 검사에서는 사례 추출 대신 서로 겹치지 않는 최종 본문을 사용합니다.
const draft: NewsDraft = { kind: 'report', title: '원문 경력과 후속 지원 안내', question: '언제 누구에게 후속 안내를 하나요?',
  answer: '원문은 참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계한다고 안내합니다.', audience: '행사 참여자',
  sections: [
    { heading: '현장 활동', paragraphs: ['원문은 10월 1일 현장 행사를 개최했다고 소개합니다.'], quote: '지난 10월 1일 행사를 개최했다.' },
    { heading: '키피오의 해설', paragraphs: ['키피오의 제안: 이전 경력과 활용 능력을 나눠 관심 직무와 비교해 보세요.'], quote: '참가자의 이전 경력과 관심 직무를 소개했다.' },
    { heading: '첫 참가 사례', paragraphs: ['원문에서 소개한 첫 참가자는 20년 넘게 일하다 작년에 퇴직했습니다.'], quote: '20년 넘게 일하다 작년에 퇴직했다.' },
    { heading: '둘째 참가 사례', paragraphs: ['두 번째 참가자는 교육과 인턴십 확대를 바랐으며 확정 계획은 아닙니다.'], quote: '교육과 인턴십 연계 확대를 바란다.' },
    { heading: '직무 목록', paragraphs: ['소개된 직무: 관광 통역 안내 · 의료관광 코디네이터'], quote: '관광 통역 안내, 의료관광 코디네이터를 소개했다.' },
  ] };
const excerpts = [draft.answer, ...draft.sections.flatMap(section => section.paragraphs)];
const keys = ['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'];
const response = { name: '시험', schema: { properties: { quality: { properties: Object.fromEntries(keys.map(key => [key,
  { type: 'object', required: ['passed', 'reason', 'excerptIndex'], properties: {
    passed: { type: 'boolean' }, reason: { type: 'string' }, excerptIndex: { type: 'integer', enum: [-1, 0, 1, 2, 3, 4, 5] },
  } }])) } } } };
const plan = {} as FixedCases;
const limited = fixedCaseJudgmentSchema(response, plan, excerpts, draft);
const qualityItems = (limited.schema.properties as typeof response.schema.properties).quality.properties;
const field = (key: string) => qualityItems[key].properties as unknown as Record<string, { enum?: string[]; properties?: Record<string, { enum: number[] }>; required?: string[] }>;

it('행사와 후속 안내 및 각 본문은 해당 문장 번호만 선택할 수 있다', () => {
  expect(field('timeliness').evidenceIndexes).toMatchObject({ required: ['followup', 'completed_event'], properties: {
    followup: { enum: [-1, 0] }, completed_event: { enum: [-1, 1] },
  } });
  expect(field('coverage').evidenceIndexes).toMatchObject({ required: ['answer', 'section_1', 'section_2', 'section_3', 'section_4', 'section_5'] });
  for (let index = 1; index <= 5; index++)
    expect(field('coverage').evidenceIndexes.properties![`section_${index}`].enum).toEqual([-1, index]);
  expect(response.schema.properties.quality.properties.timeliness.required).not.toContain('evidenceIndexes');
  expect(fixedCaseJudgmentSchema(response, null, excerpts, draft)).toBe(response);
});

it('모든 품질 항목에서 단일 확인·미확인 선택이 합격과 이유를 함께 결정한다', () => {
  for (const key of keys) {
    const [positive, negative] = field(key).decision.enum!;
    expect(field(key).passed).toBeUndefined();
    expect(field(key).reason).toBeUndefined();
    expect(fixedCaseQuality({ decision: negative, passed: true, reason: positive, excerptIndex: 0 }, key, plan, excerpts))
      .toMatchObject({ passed: false });
    expect(fixedCaseQuality({ decision: positive, passed: false, reason: negative, excerptIndex: 0 }, key, plan, excerpts))
      .toMatchObject({ passed: true });
    expect(fixedCaseQuality({ passed: true, reason: positive, excerptIndex: 0 }, key, plan, excerpts).passed).toBe(false);
  }
  expect(fixedCaseQuality({ passed: false, reason: '기존 일반 기사 판정 이유입니다.', excerptIndex: 0 }, 'scope', null, excerpts))
    .toMatchObject({ passed: false, reason: '기존 일반 기사 판정 이유입니다.' });
});

function verdict() {
  return { quality: Object.fromEntries(keys.map(key => [key, fixedCaseQuality({ decision: field(key).decision.enum![0],
    detail: '원문 경력·활용 능력과 관심 직무의 비교 내용을 확인했습니다.',
    excerptIndex: key === 'usefulness' ? 2 : 0,
    ...(key === 'timeliness' ? { evidenceIndexes: { followup: 0, completed_event: 1 } }
      : key === 'coverage' ? { evidenceIndexes: { answer: 0, section_1: 1, section_2: 2, section_3: 3, section_4: 4, section_5: 5 } } : {}),
  }, key, plan, excerpts)])) };
}

it('다른 부분의 번호·누락·추가·분수·범위 밖·미확인 선택은 서버 검사에서도 보류한다', () => {
  const valid = verdict();
  expect(fixedCaseReviewIssue(valid, plan, draft)).toBe(false);
  const choices = [{}, { followup: 0 }, { followup: 0, completed_event: 0 }, { followup: 0, completed_event: -1 },
    { followup: 0, completed_event: 0.5 }, { followup: 0, completed_event: 999 }, { followup: 0, completed_event: 1, extra: 2 }];
  for (const evidenceIndexes of choices) {
    const changed = structuredClone(valid);
    changed.quality.timeliness.evidenceIndexes = evidenceIndexes;
    expect(fixedCaseReviewIssue(changed, plan, draft)).toBe(true);
  }
  for (const key of keys) {
    const failed = structuredClone(valid);
    failed.quality[key] = fixedCaseQuality({ decision: field(key).decision.enum![1], excerptIndex: 0 }, key, plan, excerpts);
    expect(fixedCaseReviewIssue(failed, plan, draft)).toBe(true);
  }
});

it('원문 번호와 초안 번호를 혼동하거나 다른 사례를 가리킨 사실 판정은 보류한다', () => {
  const quotes = [...draft.sections.map(section => section.quote).reverse(), draft.answer];
  const checks = [0, 1, 2, 3, 4, 5].map(part => ({ part, supported: true, quoteIndex: part === 0 ? 5 : 5 - part }));
  expect(fixedCaseSourceIssue(checks, plan, draft, quotes)).toBe(false);
  const schema = fixedCaseJudgmentSchema(response, plan, excerpts, draft, quotes).schema.properties as Record<string, unknown>;
  expect(schema.checks).toMatchObject({ minItems: 6, maxItems: 6 });
  for (const quoteIndex of [0, -1, 0.5, 999]) {
    const changed = checks.map(check => check.part === 0 ? { ...check, quoteIndex } : check);
    expect(fixedCaseSourceIssue(changed, plan, draft, quotes)).toBe(true);
  }
  expect(fixedCaseSourceIssue(checks.slice(1), plan, draft, quotes)).toBe(true);
  expect(fixedCaseSourceIssue([checks[0], checks[0], ...checks.slice(2)], plan, draft, quotes)).toBe(true);
  const summary = verdict();
  summary.quality.usefulness = fixedCaseQuality({ decision: '확인됨', excerptIndex: 2,
    detail: '행사 참여자에게 10월 중 맞춤형 채용 정보를 제공하여 도움이 됩니다.' }, 'usefulness', plan, excerpts);
  expect(fixedCaseReviewIssue(summary, plan, draft)).toBe(true);
});
