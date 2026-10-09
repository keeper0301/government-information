import { afterEach, expect, it, vi } from 'vitest';
import { makeCopyRepair, applyCopyRepair, copyRepairIssue } from '@/lib/news-publication/copy-repair';
import { collectReportCore } from '@/lib/news-publication/report-core';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

it('응답의 문단 이름과 개수를 코드에서 고정하고 위치 번호를 다시 받지 않는다', () => {
  const input = { sections: [{ paragraphs: [copied, copied] }] };
  const plan = makeCopyRepair(input, copied)!;
  const schema = plan.responseSchema.schema as { properties: { edits: { required: string[]; properties: Record<string, unknown> } } };
  expect(schema.properties.edits.required).toEqual(['paragraph_0', 'paragraph_1']);
  expect(schema.properties.edits.properties).toEqual({ paragraph_0: { type: 'string' }, paragraph_1: { type: 'string' } });
  expect(applyCopyRepair(input, { edits: { paragraph_1: replacement, paragraph_0: replacement } }, plan)).not.toBeNull();
  expect(applyCopyRepair(input, { edits: { paragraph_0: replacement } }, plan)).toBeNull();
  expect(copyRepairIssue(input, { edits: { paragraph_0: replacement } }, plan)).toBe('수정할 문단이 누락됐습니다.');
  expect(applyCopyRepair(input, { edits: { paragraph_0: replacement, paragraph_1: replacement, paragraph_2: replacement } }, plan)).toBeNull();
});

const copied = '정부 발표는 청년 근로자를 대상으로 하는 상담과 신청 안내를 구분하여 제공하고 지원 확정 여부는 담당 기관이 별도로 판단한다고 설명했습니다.';
const replacement = '청년 근로자를 위한 상담과 신청 안내가 발표됐습니다. 대상에 해당한다는 설명과 실제 지원 결정은 구분됩니다.';
const draft = { title: '지원 안내와 지급 결정의 차이', answer: '지원은 별도 결정됩니다.',
  sections: [
    { heading: '안내의 범위', quote: copied, quoteIndex: 2, caseIndex: -1, paragraphs: [copied, '다른 정상 문단을 보존합니다.'] },
    { heading: '독자의 판단 기준', quote: '개별 지원 여부는 별도로 결정됩니다.', quoteIndex: 1, caseIndex: -1, paragraphs: ['정상인 다른 부분도 보존합니다.'] },
  ] };

it('복사 오류가 있는 문단만 선택하고 제목이나 다른 정상 문단은 선택하지 않는다', () => {
  const plan = makeCopyRepair(draft, copied);
  expect(plan?.targets.map(target => [target.sectionIndex, target.paragraphIndex])).toEqual([[0, 0]]);
  expect(plan?.prompt).toContain(copied.slice(0, 50));
  expect(makeCopyRepair({ ...draft, sections: [] }, copied)).toBeNull();
});

it('긴 목록의 앞부분만 고치고 다른 복사 구절을 남기지 않도록 전체 구절을 알려준다', () => {
  const original = `${copied} 이어서 다른 직무 설명도 충분한 길이로 제공합니다. ${copied}`;
  const plan = makeCopyRepair({ sections: [{ paragraphs: [original] }] }, copied)!;
  expect(plan.targets[0].copied).toEqual([copied, copied]);
});

it('앞 구절 안에서 시작해 더 뒤로 뻗는 복사 구절도 전달한다', () => {
  const text = '가'.repeat(60) + '나'.repeat(40);
  const source = '가'.repeat(60) + ' 분리된 원문 구절 ' + '가'.repeat(20) + '나'.repeat(40);
  const spans = makeCopyRepair({ sections: [{ paragraphs: [text] }] }, source)!.targets[0].copied;
  expect(spans).toContain(text.slice(0, 60));
  expect(spans).toContain(text.slice(40, 100));
});

it('지정 문단만 교체하며 제목·답변·인용·사례 번호와 원래 입력을 보존한다', () => {
  const before = structuredClone(draft);
  const plan = makeCopyRepair(draft, copied)!;
  const value = applyCopyRepair(draft, { edits: { paragraph_0: replacement } }, plan);
  expect(value).toEqual({ ...draft, sections: [{ ...draft.sections[0], paragraphs: [replacement, draft.sections[0].paragraphs[1]] }, draft.sections[1]] });
  expect(draft).toEqual(before);
  expect(applyCopyRepair({ ...draft, title: '변경된 제목' }, { edits: { paragraph_0: replacement } }, plan)).toBeNull();
  const changed = structuredClone(draft);
  changed.sections[1].paragraphs[0] = '다른 정상 문단이 이미 바뀐 입력입니다.';
  expect(applyCopyRepair(changed, { edits: { paragraph_0: replacement } }, plan)).toBeNull();
});

it.each([
  { edits: [] },
  { edits: [{ sectionIndex: 1, paragraphIndex: 0, text: replacement }] },
  { edits: [{ sectionIndex: 0, paragraphIndex: 9, text: replacement }] },
  { edits: [{ sectionIndex: 0, paragraphIndex: 0, text: 7 }] },
  { edits: [{ sectionIndex: 0, paragraphIndex: 0, text: replacement, quoteIndex: 9 }] },
  { edits: [{ sectionIndex: 0, paragraphIndex: 0, text: replacement }], title: '제목을 바꾸려는 응답' },
])('누락·잘못된 위치·다른 필드 변경 응답을 적용하지 않는다: %j', reply => {
  expect(applyCopyRepair(draft, reply, makeCopyRepair(draft, copied)!)).toBeNull();
});

it('여러 복사 문단은 모두 수정해야 하며 중복 위치나 바뀐 입력은 거절한다', () => {
  const original = { ...draft, sections: [{ ...draft.sections[0], paragraphs: [copied, copied] }] };
  const plan = makeCopyRepair(original, copied)!;
  const edit = { sectionIndex: 0, paragraphIndex: 0, text: replacement };
  expect(applyCopyRepair(original, { edits: [edit, edit] }, plan)).toBeNull();
  expect(applyCopyRepair(original, { edits: { paragraph_0: replacement, paragraph_1: replacement } }, plan)).not.toBeNull();
  expect(applyCopyRepair(draft, { edits: { paragraph_0: replacement, paragraph_1: replacement } }, plan)).toBeNull();
});

it.each([null, [], '문자열', { sections: [null] }, { sections: [{ paragraphs: [7] }] }])
('알 수 없는 초안 형식에서는 수정 위치를 추측하지 않는다: %j', value => {
  expect(makeCopyRepair(value, copied)).toBeNull();
});

const quote = '청년 근로자가 신청할 수 있습니다.';
const article = { kind: 'application', title: '지원 신청과 실제 지원 결정을 구분하는 방법',
  question: '신청 대상이면 지원이 확정되나요?', answer: '신청 대상과 실제 지원 여부를 구분해야 합니다.', audience: '청년 근로자',
  sections: [
    { heading: '발표에서 확인된 내용', paragraphs: [copied], quoteIndex: 0, caseIndex: -1 },
    { heading: '현재 확인할 준비 사항', paragraphs: ['기관이 안내한 대상과 본인에게 적용되는 조건을 대조해야 합니다. 신청 가능 여부는 실제 지원의 확정과 다르며, 상담에서 받은 설명을 선정 결과로 오해하지 않고 절차별로 확인하는 편이 도움이 됩니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '개별 지원 결정의 의미', paragraphs: ['담당 기관의 실제 지원 판단은 안내를 읽는 과정과 별개입니다. 원문에 없는 서류나 추가 자격을 임의로 요구하지 않으며, 필요한 조건을 살펴볼 때는 발표한 사실과 키피오의 조언을 구분할 수 있습니다.'], quoteIndex: 0, caseIndex: -1 },
  ] };
const source = { title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
  body: quote + '\n' + copied, hash: '원문 식별값', publishedAt: '2026-10-06' };

it('실제 작성 경로에서 복사 문단만 수정하고 나머지 글은 최종 판정까지 유지한다', async () => {
  mock.call.mockImplementation(async input => {
    if (input.jsonMode) return JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'].map(key =>
        [key, { passed: true, reason: '신청과 개별 지원 결정의 차이를 본문에서 구분했습니다.', excerptIndex: 1 }])),
      checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) });
    if (input.responseSchema.name === 'policy_news_copy_repair') return JSON.stringify({ edits: { paragraph_0: replacement } });
    return JSON.stringify(article);
  });
  const result = await generateVerifiedNews(source);
  expect(result.title).toBe(article.title);
  expect(result.answer).toBe(article.answer);
  expect(result.sections[0].paragraphs).toEqual([replacement]);
  expect(result.sections.slice(1)).toEqual(article.sections.slice(1).map(section => ({ ...section, quote })));
  expect(mock.call.mock.calls.map(([input]) => input.timeoutMs)).toEqual([40000, 25000, 25000]);
  expect(mock.call.mock.calls[2][0].prompt).toContain(JSON.stringify(result.sections));
});

it('문단 수정에서 새 숫자를 만들어도 기존 전체 검사를 우회하지 못한다', async () => {
  mock.call.mockResolvedValueOnce(JSON.stringify(article)).mockResolvedValueOnce(JSON.stringify({
    edits: { paragraph_0: replacement + ' 지원금은 99만원입니다.' },
  }));
  await expect(generateVerifiedNews(source)).rejects.toThrow('원문에서 확인하지 못한 숫자');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it('정확한 원문 숫자 안내가 있는 문단과 드러난 복사 문단을 함께 선택한다', () => {
  const value = { ...draft, sections: [...draft.sections,
    { heading: '인원 안내', paragraphs: ['행사에는 약 70명이 참석했습니다. 다른 숫자 170명은 서로 다릅니다.'] }] };
  const body = `${copied} 참석자는 70여 명입니다. 별도 자료 인원은 170명입니다. 참가자는 1000여 명입니다.`;
  const plan = makeCopyRepair(value, body, '원문에서 확인하지 못한 숫자: 70명. 원문 숫자와 단위를 함께 쓰세요: 70명 → 70여명.');
  expect(plan?.targets.map(target => [target.sectionIndex, target.paragraphIndex])).toEqual([[0, 0], [2, 0]]);
  const onlyDifferent = { sections: [{ paragraphs: ['행사에는 170명 또는 70여 명이 참석했습니다.'] }] };
  expect(makeCopyRepair(onlyDifferent, copied, '원문 숫자 안내: 70명 → 70여명.')).toBeNull();
  expect(makeCopyRepair(onlyDifferent, copied, '원문에서 확인하지 못한 숫자: 70명. 원문 표기: 70명 → 70여명.')).toBeNull();
  expect(makeCopyRepair({ sections: [{ paragraphs: ['참가자는 약 1,000명이었습니다.'] }] }, body,
    '원문에서 확인하지 못한 숫자: 1000명. 원문 표기: 1000명 → 1000여명.')?.targets).toHaveLength(1);
});

it.each(['해설 근거', '일반 요약'])('판정 후보에서 해설 근거를 구분하고 다른 근거는 보류한다: %s', choice => {
  const event = '지난 10월 1일 서울중장년내일센터에서 행사를 개최했다.';
  const followUp = '참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계한다는 점에서 차별성을 지닌다.';
  const body = [event, followUp, quote, copied].join('\n');
  const core = collectReportCore(body, [event, followUp]);
  const report = { ...article, ...core, kind: 'report', sections: article.sections.map((section, index) =>
    index === 1 ? { ...section, heading: '키피오의 해설: 지원 결정의 판단 기준' } : section) };
  mock.call.mockImplementation(async input => {
    if (input.jsonMode) {
      const candidates = JSON.parse(input.prompt.split('선택 가능한 초안 문장: ')[1].split('. scopeOnly=true인')[0]);
      const eligible = candidates.filter((candidate: { usefulnessEligible: boolean }) => candidate.usefulnessEligible);
      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible.every((candidate: { excerpt: string }) => report.sections[1].paragraphs[0].includes(candidate.excerpt))).toBe(true);
      expect(input.responseSchema.schema.properties.quality.properties.usefulness.properties.excerptIndex.enum)
        .toEqual([-1, ...eligible.map((candidate: { excerptIndex: number }) => candidate.excerptIndex)]);
      const excerptIndex = choice === '해설 근거' ? eligible[0].excerptIndex : 0;
      return JSON.stringify({ supported: true, originalValue: true, issues: [],
        quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'].map(key =>
          [key, { passed: true, reason: '본문에서 신청과 지원 결정의 구분을 설명했습니다.', excerptIndex }])),
        checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: 0 })) });
    }
    return JSON.stringify(input.responseSchema.name === 'policy_news_copy_repair'
      ? { edits: { paragraph_0: replacement } } : report);
  });
  const result = generateVerifiedNews({ ...source, body });
  return choice === '해설 근거' ? expect(result).resolves.toHaveProperty('editorialReview')
    : expect(result).rejects.toThrow('별도 해설 본문으로 입증되지');
});
