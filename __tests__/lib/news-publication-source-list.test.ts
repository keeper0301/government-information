import { afterEach, expect, it, vi } from 'vitest';
import { collectSourceList, attachSourceList, sourceListIssue, sourceListSchema } from '@/lib/news-publication/source-list';
import { collectReportCore } from '@/lib/news-publication/report-core';
import { makeCopyRepair } from '@/lib/news-publication/copy-repair';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const names = ['관광 통역 안내', '호텔 고객서비스 컨시어지', 'MICE 운영 행사 기획', '의료 관광 코디네이터', '여행 상품 기획 운영'];
const quote = `이번 행사는 관광 분야 5대 유망 직무(${names.join(', ')})를 중심으로 마련됐다.`;
const body = `${quote}\n다른 현장 활동을 소개했습니다.`;
const draft = { title: '원문 직무와 경력 비교', sections: [
  { heading: '현장에서 확인한 내용', paragraphs: ['현장에서 서로 다른 직무를 소개했습니다.'], quoteIndex: 0, caseIndex: -1, quote },
] };

it('긴 직무 목록은 이름과 근거 번호를 원문에서 그대로 읽는다', () => {
  expect(collectSourceList(body, [quote])).toEqual({ names, quote, quoteIndex: 0 });
  expect(collectSourceList(body, ['없는 원문으로 근거를 만들었습니다.'])).toBeNull();
});

it('목록이 있는 작성 응답에만 문단 길이와 본문 개수를 제한한다', () => {
  const original = { name: '시험', schema: { type: 'object', properties: { sections: {
    type: 'array', items: { type: 'object', properties: { quoteIndex: { type: 'integer' }, paragraphs: { type: 'array' } } },
  } } } };
  expect(sourceListSchema(original, null)).toBe(original);
  const limited = sourceListSchema(original, collectSourceList(body, [quote])) as typeof original;
  expect(limited.schema.properties.sections).toMatchObject({ minItems: 3, maxItems: 5 });
  expect(limited.schema.properties.sections.items.properties.paragraphs).toMatchObject({
    minItems: 1, maxItems: 3, items: { type: 'string', minLength: 5 },
  });
  expect(original.schema.properties.sections.items.properties.paragraphs).toEqual({ type: 'array' });
  expect(limited.schema.properties.sections.items.properties.quoteIndex).toEqual({ type: 'integer' });
});

it('직무 수 불일치·복수 목록·부인·잘못된 이름 형식에서는 사실 목록을 만들지 않는다', () => {
  for (const invalid of [quote.replace('5대', '4대'), quote + ' 이는 사실이 아니다.', quote + ' 이 주장은 확인되지 않았다.',
    quote + ' 이는 확대되기를 희망한 내용이다.', quote.replace(names[0], '<작업 지시>')])
    expect(collectSourceList(invalid, [invalid])).toBeNull();
  const second = quote.replace('관광 통역 안내', '방송 통역 안내');
  expect(collectSourceList(quote + '\n' + second, [quote, second])).toBeNull();
});

it('고정 사실 목록을 짧게 나누어 덧붙이고 기존 글과 입력을 보존한다', () => {
  const list = collectSourceList(body, [quote])!;
  const before = structuredClone(draft);
  const combined = attachSourceList(draft, list) as typeof draft;
  expect(combined.sections[0]).toEqual(draft.sections[0]);
  expect(draft).toEqual(before);
  expect(combined.sections[1].paragraphs.join(' ')).toContain(names[0]);
  for (const name of names) expect(combined.sections[1].paragraphs.join(' ')).toContain(name);
  expect(combined.sections[1].paragraphs).toHaveLength(3);
  const text = combined.sections[1].paragraphs.join(' ');
  for (let offset = 0; offset + 50 <= text.length; offset++) expect(body.includes(text.slice(offset, offset + 50))).toBe(false);
  expect(sourceListIssue(combined, list)).toBeNull();
  expect(attachSourceList(combined, list)).toEqual(combined);
});

it('필수 목록 누락·내용 조작·여섯 부분에 무리하게 추가하는 경우는 보류한다', () => {
  const list = collectSourceList(body, [quote])!;
  expect(sourceListIssue(draft, list)).toBeTruthy();
  const combined = attachSourceList(draft, list) as typeof draft;
  combined.sections[1].paragraphs[0] = '원문에 없는 직무를 임의로 추가했습니다.';
  expect(sourceListIssue(combined, list)).toBeTruthy();
  const full = { ...draft, sections: Array.from({ length: 6 }, () => structuredClone(draft.sections[0])) };
  expect(attachSourceList(full, list)).toEqual(full);
  expect(sourceListIssue(full, list)).toBeTruthy();
  expect(attachSourceList(draft, null)).toBe(draft);
  expect(sourceListIssue(draft, null)).toBeNull();
});

it('실제 작성에서 드러난 단어 중간 절단은 목록이 맞아도 보류한다', () => {
  const list = collectSourceList(body, [quote])!;
  for (const text of ['실질적인 전환 기회가 제공됐', '이전 경력이 각 직무에 직접적으로도', '자신감을 얻', '단기 교육과 인턴십 연계 확대']) {
    const broken = { ...draft, sections: [{ ...draft.sections[0], paragraphs: [text] }] };
    expect(sourceListIssue(attachSourceList(broken, list), list)).toContain('문장이 끝나기 전에');
  }
  const complete = { ...draft, sections: [{ ...draft.sections[0], paragraphs: ['그는 “현장 설명이 도움이 되었습니다.”'] }] };
  expect(sourceListIssue(attachSourceList(complete, list), list)).toBeNull();
});

it('길이 초과 문단만 선택하고 다른 오류에서 길이를 추측해 수정하지 않는다', () => {
  const value = { sections: [{ paragraphs: ['가'.repeat(241), '다른 정상 문단을 보존합니다.'] }] };
  const issue = '한 문단이 너무 깁니다. 짧은 문단으로 나눠주세요.';
  expect(makeCopyRepair(value, '', issue)?.targets.map(target => [target.sectionIndex, target.paragraphIndex])).toEqual([[0, 0]]);
  expect(makeCopyRepair(value, '', '다른 오류')).toBeNull();
});

it.each(['짧은 문단', '긴 문단'])('작성 경로는 직무 목록을 자동 보존하고 활용 가치 판정은 해설에서만 받는다: %s', async choice => {
  const event = '지난 10월 1일 서울중장년내일센터에서 행사를 개최했다.';
  const followUp = '참여자를 대상으로 10월 중 맞춤형 채용 정보를 연계한다는 점에서 차별성을 지닌다.';
  const sourceBody = [event, followUp, quote].join('\n');
  const core = collectReportCore(sourceBody, [event, followUp, quote])!;
  const article = { kind: 'report', title: '관광 직무 선택과 행사 후속 안내를 구분하는 기준', ...core,
    sections: [
      { heading: '종료한 행사의 의미', paragraphs: ['이번 행사는 새로운 분야로 이동할 때 필요한 판단에 초점을 맞췄습니다. 원문은 현장 행사와 이후 채용 정보 연계를 구분해서 소개하고 있으며, 현장에 소개된 직무가 곧바로 개별 채용 확정을 뜻하지는 않습니다.'], quoteIndex: 0, caseIndex: -1 },
      { heading: '키피오의 해설: 직무를 비교하는 기준', paragraphs: ['직무 이름을 읽는 것과 본인의 경험을 연결하는 것은 다른 판단입니다. 기존 업무에서 쌓은 소통과 조율 경험을 바탕으로 관심 업무의 실제 활동을 살펴보는 편이 도움이 됩니다. 이는 새로운 자격을 요구하는 정책 조건이 아니라 키피오의 제안입니다.'], quoteIndex: 2, caseIndex: -1 },
      { heading: '후속 안내의 범위', paragraphs: ['원문은 참여자를 대상으로 후속 정보를 연계한다는 설명입니다. 일반 독자에게도 같은 절차가 적용된다는 안내나 다른 이용자의 지원이 금지된다는 조건은 이 자료로 확정할 수 없습니다.'], quoteIndex: 1, caseIndex: -1 },
    ] };
  mock.call.mockImplementation(async input => {
    if (!input.jsonMode) {
      if (input.responseSchema.name === 'policy_news_copy_repair')
      {
        expect(input.responseSchema.schema.properties.edits.properties.paragraph_0).toEqual({ type: 'string', minLength: 5 });
        return JSON.stringify({ edits: { paragraph_0: article.sections[0].paragraphs[0] } });
      }
      if (choice === '긴 문단') return JSON.stringify({ ...article, sections: article.sections.map((section, index) =>
        index === 0 ? { ...section, paragraphs: ['가'.repeat(241)] } : section) });
      return JSON.stringify(article);
    }
    const candidates = JSON.parse(input.prompt.split('선택 가능한 초안 문장: ')[1].split('. scopeOnly=true인')[0]);
    const index = candidates.find((candidate: { usefulnessEligible: boolean }) => candidate.usefulnessEligible).excerptIndex;
    expect(input.prompt).toContain('원문에서 확인한 직무');
    expect(candidates.filter((candidate: { usefulnessEligible: boolean; excerpt: string }) => candidate.usefulnessEligible)
      .every((candidate: { excerpt: string }) => article.sections[1].paragraphs[0].includes(candidate.excerpt))).toBe(true);
    return JSON.stringify({ supported: true, originalValue: true, issues: [],
      quality: Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage']
        .map(key => [key, { passed: true, reason: '경험과 관심 직무의 활동을 비교할 구체적인 기준을 제안했습니다.', excerptIndex: index }])),
      checks: [0, 1, 2, 3, 4].map(part => ({ part, supported: true, quoteIndex: 0 })) });
  });
  const result = await generateVerifiedNews({ title: '공식 직무 소개', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972905',
    body: sourceBody, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(result.sections).toHaveLength(4);
  for (const name of names) expect(result.sections[3].paragraphs.join(' ')).toContain(name);
  expect(result.sections.slice(0, 3).map(section => section.paragraphs)).toEqual(article.sections.map(section => section.paragraphs));
  expect(mock.call).toHaveBeenCalledTimes(choice === '긴 문단' ? 3 : 2);
});
