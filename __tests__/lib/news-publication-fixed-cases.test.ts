import { afterEach, expect, it, vi } from 'vitest';
import { collectSourceFacts } from '@/lib/news-publication/source-facts';
import { collectFixedCases, attachFixedCases, fixedCaseIssue, fixedReportDraft, fixedCaseJudgmentSchema, fixedCaseReviewIssue } from '@/lib/news-publication/fixed-cases';
import { collectReportCore } from '@/lib/news-publication/report-core';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const quotes = [
  '지난 10월 1일 서울중장년내일센터에서 행사를 개최했다.',
  '중장년 구직자 70여 명이 참석해 강의실을 가득 메웠다.',
  '현직 전문가가 직무 토크콘서트에 참여했습니다.',
  '직무별 부스에서 1:1 멘토링이 이어졌습니다.',
  '참여자들은 진입 장벽, 필요한 자격증, 실제 근무 형태를 질문했습니다.',
  '대기업에서 20년 넘게 영업과 마케팅 업무를 하다 작년에 퇴직했다는 박진우(54세, 가명) 씨는 평소 관심 있던 여행과 외국어 분야에 도전하고자 이번 행사를 찾았다.',
  '박 씨는 현직 가이드가 중장년의 강점과 초기 진입 시의 시행착오를 솔직하게 짚어줘 큰 도움이 됐다며 소감을 전했다.',
  '이어 오랜 직장 생활로 다져진 소통 능력이 관광 통역 현장에서도 충분한 경쟁력이 될 수 있다는 자신감을 얻었다고 말했다.',
  '의료관광 코디네이터 부스에서 집중적인 상담을 마친 정은숙(51세, 가명) 씨 역시 과거 병원 행정직 경험을 살려 경력 전환을 준비 중이다.',
  '정 씨는 나이로 인한 진입 장벽을 걱정했으나 환자를 편안하게 돌보고 조율하는 데는 연륜과 꼼꼼함이 강점이라는 멘토의 격려에 용기를 얻었다.',
  '정 씨는 또한 단기 교육이나 인턴십 연계로 확대되기를 바란다는 정책적 제언을 덧붙였다.',
];
const facts = collectSourceFacts(quotes.join('\n'), quotes);

it('원문 경력·작년 퇴직·관심 분야와 참가자 희망을 고정된 사례로 보존한다', () => {
  const plan = collectFixedCases(facts, quotes) as { sections: { paragraphs: string[] }[] };
  expect(plan).not.toBeNull();
  expect(plan.sections).toHaveLength(2);
  const first = plan.sections[0].paragraphs.join(' ');
  expect(first).toContain('20년 넘게');
  expect(first).toContain('작년에');
  expect(first).toContain('영업과 마케팅');
  expect(first).toContain('여행과 외국어');
  const second = plan.sections[1].paragraphs.join(' ');
  expect(second).toContain('병원 행정직');
  expect(second).toContain('참가자가 바란');
  expect(second).toContain('확정 계획');
});

it('확인할 필수 경력이나 개인 제언이 없으면 기존 작성 경로를 유지한다', () => {
  expect(collectFixedCases(facts, quotes.map(text => text.replace('작년에', '언젠가')))).toBeNull();
  expect(collectFixedCases(facts, quotes.filter(text => !text.includes('바란다')))).toBeNull();
});

it('부정·취소·예정·가정인 현장 활동을 실제 진행 사실로 바꾸지 않는다', () => {
  const changes = [
    ['참석해 강의실을 가득 메웠다', '참석하지 않아 강의실이 비었다'],
    ['참여했습니다', '참여하지 않았습니다'],
    ['이어졌습니다', '진행되지 않았습니다'],
    ['질문했습니다', '질문하지 않았습니다'],
    ['개최했다.', '개최했다면 좋았을 것이다.'],
    ['참여했습니다', '참여할 예정입니다'],
  ];
  for (const [before, after] of changes) {
    const changed = quotes.map(text => text.replace(before, after));
    expect(collectFixedCases(collectSourceFacts(changed.join('\n'), changed), changed)).toBeNull();
  }
  const contradicted = [...quotes, '직무 토크콘서트가 진행됐다는 보도는 사실이 아니며 행사는 취소됐다.'];
  expect(collectFixedCases(collectSourceFacts(contradicted.join('\n'), contradicted), contradicted)).toBeNull();
  const deniedLater = [...quotes, '직무 토크콘서트가 진행됐다는 앞선 설명과 달리 실제로는 진행하지 않았다.'];
  expect(collectFixedCases(collectSourceFacts(deniedLater.join('\n'), deniedLater), deniedLater)).toBeNull();
});

it('부정된 경험·다른 참가자의 이어지는 말·누락된 사례를 고정 사실로 만들지 않는다', () => {
  for (const changed of [quotes.map(text => text.replace('도움이 됐다', '도움이 되지 않았다')),
    quotes.map(text => text.replace('자신감을 얻었다', '자신감을 얻지 못했다')),
    quotes.map(text => text.replace('용기를 얻었다', '용기를 얻지 못했다')),
    quotes.map(text => text.replace('이어 오랜', '다른 참가자는 오랜'))])
    expect(collectFixedCases(collectSourceFacts(changed.join('\n'), changed), changed)).toBeNull();
  expect(collectFixedCases({ ...facts, cases: facts.cases.slice(0, 1) }, quotes)).toBeNull();
});

const analysis = { title: '원문 경력과 직무의 연결', sections: [collectFixedCases(facts, quotes)!.event] };

it('두 해설만 받고 고정 사례를 보존하며 입력을 바꾸지 않는다', () => {
  const plan = collectFixedCases(facts, quotes)!;
  const original = structuredClone(analysis);
  const combined = attachFixedCases(analysis, plan) as typeof analysis;
  expect(analysis).toEqual(original);
  expect(combined.sections.slice(0, 1)).toEqual(analysis.sections);
  expect(fixedCaseIssue(combined, plan)).toBeNull();
  expect(attachFixedCases(combined, plan)).toBe(combined);
  const tampered = structuredClone(combined);
  tampered.sections[2].paragraphs[0] = '원문과 다른 최근 퇴직 및 성공 사례입니다.';
  expect(fixedCaseIssue(tampered, plan)).toContain('고정 참가 사례');
  expect(fixedCaseIssue({ ...combined, sections: combined.sections.slice(1) }, plan)).toBeTruthy();
  expect(fixedCaseIssue({ ...combined, sections: [combined.sections[0], combined.sections[0], ...combined.sections.slice(1)] }, plan)).toBeTruthy();
  const changedAnalysis = structuredClone(combined);
  changedAnalysis.sections[1].paragraphs[0] = '병원 행정직 경력이면 경력 전환 성공을 보장합니다.';
  expect(fixedCaseIssue(changedAnalysis, plan)).toBeTruthy();
  expect(attachFixedCases(analysis, null)).toBe(analysis);
  expect(fixedCaseIssue(analysis, null)).toBeNull();
});

it('현장 날짜·참석 인원을 원문대로 조립하고 근거가 없는 인원은 추측하지 않는다', () => {
  const plan = collectFixedCases(facts, quotes)!;
  const core = { question: '후속 안내의 대상은 누구인가요?', answer: '행사 참여자에게 후속 정보를 연계한다고 안내했습니다.', audience: '행사 참여자' };
  const result = fixedReportDraft(plan, core);
  expect(result).toMatchObject(core);
  expect(JSON.stringify(result)).toContain('70여 명');
  expect(JSON.stringify(result)).toContain('10월 1일');
  expect(collectFixedCases(facts, quotes.map(text => text.replace('70여 명', '약 70명')))).toBeNull();
  expect(collectFixedCases(facts, quotes.map(text => text.replace('중장년 구직자', '재취업을 희망하는 중장년 구직자')))).not.toBeNull();
  (result.sections[0].paragraphs as string[])[0] = '다른 내용을 넣어도 원래 계획은 유지됩니다.';
  expect(JSON.stringify(plan.event)).toContain('70여 명');
});

it('활용 가치 판정은 실제 비교 이유를 요구하고 부정 이유와 합격 표시의 혼합을 보류한다', () => {
  const plan = collectFixedCases(facts, quotes)!;
  const positive = '해설은 원문의 서로 다른 경력·활용 능력·관심 직무를 구분해 비교하는 판단 기준을 제공합니다.';
  const negative = '해설에서 경력·능력·관심 직무를 비교할 구체적인 판단 기준을 확인하지 못했습니다.';
  const response = { name: '시험', schema: { properties: { quality: { properties: { usefulness: {
    properties: { passed: { type: 'boolean' }, reason: { type: 'string' } },
  } } } } } };
  const limited = fixedCaseJudgmentSchema(response, plan) as unknown as { schema: { properties: { quality: { properties: { usefulness: { properties: Record<string, unknown> } } } } } };
  expect(limited.schema.properties.quality.properties.usefulness.properties.decision).toEqual({ type: 'string', enum: ['확인됨', '미확인'] });
  expect(limited.schema.properties.quality.properties.usefulness.properties.passed).toBeUndefined();
  expect(response.schema.properties.quality.properties.usefulness.properties.reason).toEqual({ type: 'string' });
  expect(fixedCaseJudgmentSchema(response, null)).toBe(response);
  expect(fixedCaseReviewIssue({ quality: { usefulness: { passed: true, reason: positive } } }, plan)).toBe(false);
  expect(fixedCaseReviewIssue({ quality: { usefulness: { passed: true, reason: negative } } }, plan)).toBe(true);
  expect(fixedCaseReviewIssue({ quality: { usefulness: { passed: true, reason: '후속 정보 시기가 명확합니다.' } } }, plan)).toBe(true);
  expect(fixedCaseReviewIssue({}, null)).toBe(false);
});

it('확인된 글은 새 사실 생성 없이 조립하고 활용 가치 근거를 비교 해설에서만 받는다', async () => {
  const followUp = '참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계한다는 점에서 차별성을 지닌다.';
  const names = '관광 통역 안내, 호텔 고객서비스 컨시어지, MICE 운영 행사 기획, 의료 관광 코디네이터, 여행 상품 기획 운영';
  const list = `관광 분야 5대 유망 직무(${names})를 소개했습니다.`;
  const sourceQuotes = [followUp, list, ...quotes];
  const sourceBody = sourceQuotes.join('\n');
  const core = collectReportCore(sourceBody, sourceQuotes)!;
  expect(core).not.toBeNull();
  mock.call.mockImplementation(async input => {
    expect(input.jsonMode).toBe(true);
    const final = JSON.parse(input.prompt.split('검사할 글: ')[1].split('\n제목·질문')[0]);
    expect(final.sections).toHaveLength(5);
    expect(final.sections[2].paragraphs.join(' ')).toContain('작년에');
    expect(final.sections[3].paragraphs.join(' ')).toContain('참가자가 바란');
    const candidates = JSON.parse(input.prompt.split('선택 가능한 초안 문장: ')[1].split('. scopeOnly=true인')[0]);
    const index = candidates.find((candidate: { usefulnessEligible: boolean }) => candidate.usefulnessEligible).excerptIndex;
    const items = input.responseSchema.schema.properties.quality.properties;
    return JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
        .map(key => [key, { decision: items[key].properties.decision.enum[0], detail: '원문 경력·활용 능력과 관심 직무의 구체적인 비교를 확인했습니다.',
          excerptIndex: key === 'timeliness' || key === 'coverage' ? 0 : index,
          ...(items[key].properties.evidenceIndexes ? { evidenceIndexes: Object.fromEntries(Object.entries(items[key].properties.evidenceIndexes.properties)
            .map(([name, field]) => [name, (field as { enum: number[] }).enum[1]])) } : {}) }])),
      checks: input.responseSchema.schema.properties.checks.items.anyOf.map((item: { properties: { part: { enum: number[] }; quoteIndex: { enum: number[] } } }) =>
        ({ part: item.properties.part.enum[0], supported: true, quoteIndex: item.properties.quoteIndex.enum[0] })) });
  });
  const result = await generateVerifiedNews({ title: '공식 행사 소개', body: sourceBody, publishedAt: '2026-10-06',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972905', hash: '원문 식별값' });
  expect(result.sections).toHaveLength(5);
  expect(mock.call).toHaveBeenCalledTimes(1);
  const quality = result.editorialReview as Record<string, { evidence: string[]; evidenceIndexes: Record<string, number> }>;
  expect(quality.timeliness.evidence).toHaveLength(2);
  expect(quality.coverage.evidence).toHaveLength(6);
  for (const invalid of [{}, { answer: 0 }, { ...quality.coverage.evidenceIndexes, section_1: 0 },
    { ...quality.coverage.evidenceIndexes, section_1: -1 }, { ...quality.coverage.evidenceIndexes, section_1: 0.5 },
    { ...quality.coverage.evidenceIndexes, section_1: 999 }]) {
    expect(fixedCaseReviewIssue({ quality: { ...quality, coverage: { ...quality.coverage,
      evidenceIndexes: invalid } } }, collectFixedCases(collectSourceFacts(sourceBody, sourceQuotes), sourceQuotes), result)).toBe(true);
  }
  expect(fixedCaseReviewIssue({ quality: { ...quality, timeliness: { ...quality.timeliness,
    excerptIndex: indexOfAnalysis(result) } } }, collectFixedCases(collectSourceFacts(sourceBody, sourceQuotes), sourceQuotes), result)).toBe(true);
});
function indexOfAnalysis(result: { answer: string; sections: { paragraphs: string[] }[] }) {
  return [result.answer, ...result.sections[0].paragraphs].flatMap(text => text.match(/[\s\S]{8,160}/g) ?? []).length;
}
