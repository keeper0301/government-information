import { afterEach, expect, it, vi } from 'vitest';
import { contentDepthIssue, contentDepthSchema } from '@/lib/news-publication/content-depth';
import { contentDepthFixture } from './news-content-depth-fixture';
import type { NewsDraft } from '@/lib/news-publication/validation';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const quotes = ['전시는 훈몽자회와 언삼국지 학습 자료를 소개합니다.', '체험관에는 디지털 음절표를 마련했습니다.', '관람 시간은 시설별 안내를 확인해야 합니다.'];
const draft: NewsDraft = { kind: 'report', title: '한글 전시에서 살펴볼 학습 자료와 음절 체험',
  question: '한글 전시에서는 어떤 내용을 살펴볼 수 있나요?',
  answer: '옛 학습 자료와 디지털 음절 체험이 전시의 서로 다른 내용을 보여줍니다. 관람 시간은 시설 안내로 확인해야 합니다.', audience: '한글 전시를 살펴보려는 관람객',
  sections: [
    { heading: '학습 자료의 구성', paragraphs: ['훈몽자회와 언삼국지가 전시 자료로 소개됩니다. 책에 담긴 학습 자료를 보는 부분과 디지털 체험 부분은 구분해서 살펴볼 수 있습니다.'], quote: quotes[0] },
    { heading: '체험관에서 볼 내용', paragraphs: ['디지털 방식으로 음절표를 살펴보는 체험 공간이 마련됐습니다. 책을 보는 전시와는 제시 방식이 다른 내용입니다.'], quote: quotes[1] },
    { heading: '방문 전 이용 시간', paragraphs: ['시설 안내를 통해 관람 시간을 확인해야 합니다. 이 기사만으로 모든 시설의 이용 시간이 같다고 볼 수는 없습니다.'], quote: quotes[2] },
  ] };
const depth = () => ({ ...contentDepthFixture(3), sections: Object.fromEntries(Object.values(contentDepthFixture(3).sections).map((check, i) => [String(i),
  { ...check, role: i === 2 ? 'context' : 'specific', reason: ['훈몽자회와 언삼국지의 학습 자료 전시를 설명합니다.', '디지털 음절표 체험과 책 전시의 차이를 설명합니다.', '시설마다 관람 시간을 확인해야 하는 주의사항입니다.'][i] }])) });

it('구체적인 문화 내용 두 부분과 필요한 주의 한 부분은 허용한다', () => {
  expect(contentDepthIssue(depth(), draft)).toBeNull();
});
it.each([undefined, {}, { missingFacts: [], sections: null }])('검사 누락은 합격으로 처리하지 않는다', value => {
  expect(contentDepthIssue(value, draft)).toContain('누락');
});
it('원문 핵심 누락이 있으면 나머지가 합격이어도 보류한다', () => {
  expect(contentDepthIssue({ ...depth(), missingFacts: ['원문에 있는 디지털 체험 내용을 빠뜨렸습니다.'] }, draft)).toContain('누락');
});
it.each(['generic', 'context'])('일반 조언이나 주의만 늘린 글은 보류한다: %s', role => {
  expect(contentDepthIssue({ ...depth(), sections: Object.fromEntries(Object.entries(depth().sections).map(([key, check]) => [key, { ...check, role }])) }, draft)).not.toBeNull();
});
it.each([-1, 99, 0.5])('본문에 없는 문단 번호를 거절한다: %s', paragraphIndex => {
  const value = depth(); value.sections[0].paragraphIndex = paragraphIndex;
  expect(contentDepthIssue(value, draft)).not.toBeNull();
});
it('중복 본문 번호로 검사 누락을 숨길 수 없다', () => {
  const value = depth(); value.sections[1].sectionIndex = 0;
  expect(contentDepthIssue(value, draft)).toContain('중복');
});
it.each(['', '충분합니다.'])('판정 이유가 빈약하면 보류한다: %s', reason => {
  const value = depth(); value.sections[0].reason = reason;
  expect(contentDepthIssue(value, draft)).toContain('부족');
});
it('동일 문단을 복제해 구체적인 정보 개수를 늘릴 수 없다', () => {
  const repeated = { ...draft, sections: draft.sections.map(section => ({ ...section, paragraphs: draft.sections[0].paragraphs })) };
  expect(contentDepthIssue(depth(), repeated)).toContain('부족');
});
it('본문 여섯 부분에서 구체적 정보가 두 부분뿐이면 보류한다', () => {
  const expanded = { ...draft, sections: [...draft.sections, ...draft.sections] };
  const review = contentDepthFixture(6); Object.values(review.sections).forEach((check, i) => { if (i > 1) check.role = 'context'; });
  expect(contentDepthIssue(review, expanded)).toContain('부족');
});
it('응답 형식에서도 모든 본문 검사를 요구한다', () => {
  const schema = contentDepthSchema(draft);
  expect(schema.required).toEqual(['missingFacts', 'sections']);
  expect(schema.properties.sections.required).toEqual(['0', '1', '2']);
  expect(schema.properties.sections.additionalProperties).toBe(false);
  expect(Object.values(schema.properties.sections.properties).map(item => item.properties.paragraphIndex.enum)).toEqual([[0], [0], [0]]);
});

function prepare(contentDepth: unknown) {
  const generated = { ...draft, sections: draft.sections.map(({ heading, paragraphs }, quoteIndex) => ({ heading, paragraphs, quoteIndex, caseIndex: -1 })) };
  const quality = Object.fromEntries(['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'].map(key =>
    [key, { passed: true, reason: '학습 자료와 디지털 체험을 구분하고 관람 시간의 확인 범위를 설명했습니다.', excerptIndex: 1 }]));
  mock.call.mockResolvedValueOnce(JSON.stringify(generated)).mockResolvedValueOnce(JSON.stringify({ supported: true,
    originalValue: true, issues: [], quality, contentDepth,
    checks: [0, 1, 2, 3].map(part => ({ part, supported: true, quoteIndex: Math.max(0, part - 1) })) }));
  return generateVerifiedNews({ title: '한글 전시 안내', body: quotes.join(' '), hash: '원문식별값',
    publishedAt: '2026-10-06', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972999' });
}
it('생성부터 별도 검수까지 통과하고 내용 판정도 반환한다', async () => {
  await expect(prepare(depth())).resolves.toHaveProperty('contentDepth', depth());
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[0][0].prompt).toContain('문화·여행·행사형');
  expect(mock.call.mock.calls[1][0].responseSchema.schema.required).toContain('contentDepth');
});
it.each([undefined, { ...depth(), missingFacts: ['원문의 체험 내용을 빠뜨렸습니다.'] }])
('기존 품질 검사가 전부 합격해도 내용 검사 누락·실패는 공개하지 않는다', async review => {
  await expect(prepare(review)).rejects.toThrow(/내용 충실도|중요한 내용/);
  expect(mock.call).toHaveBeenCalledTimes(2);
});
