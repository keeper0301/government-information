import { expect, it } from 'vitest';
import { sourceCheckIssue, sourceAffinitySchema } from '@/lib/news-publication/source-check-issue';

const cooperation = '교육기관 간 공동학위와 교육과정 개발을 지원합니다.';
const ceremony = '공식 환영식에서 정상들이 의장대를 사열하고 있습니다.';
const draft = { sections: [{ quote: cooperation }] };
const checks = [
  { part: 0, supported: true, quote: cooperation },
  { part: 1, supported: true, quote: ceremony },
];

// 원문에 존재하는 사진 설명도 다른 본문에 붙인 근거로 수용하지 않습니다.
it('협력 설명의 근거를 의장대 사진 설명으로 바꾸면 보류한다', () => {
  expect(sourceCheckIssue(checks, 1, `${cooperation}\n${ceremony}`, draft)).toContain('본문 1');
});

it('해당 본문에 연결한 실제 원문으로 대조하면 통과한다', () => {
  const linked = checks.map(check => ({ ...check, quote: cooperation }));
  expect(sourceCheckIssue(linked, 1, `${cooperation}\n${ceremony}`, draft)).toBeNull();
});

it.each([-1, 99])('원문 밖이나 미확인 번호 %i는 합격으로 처리하지 않는다', quoteIndex => {
  const quotes = [cooperation, ceremony];
  const invalid = [checks[0], { part: 1, supported: true, quote: quotes[quoteIndex] }];
  expect(sourceCheckIssue(invalid, 1, quotes.join('\n'), draft)).toContain('본문 1');
});

it('같은 원문 문장이라도 다른 본문의 근거로 검사하면 보류한다', () => {
  const grouped = { sections: [{ quote: cooperation }, { quote: ceremony }] };
  const switched = [checks[0], { ...checks[1], quote: ceremony }, { part: 2, supported: true, quote: cooperation }];
  expect(sourceCheckIssue(switched, 2, `${cooperation}\n${ceremony}`, grouped)).toContain('본문 1');
});

it('미확인 판정은 정상 근거 번호를 골라도 통과하지 않는다', () => {
  const rejected = [checks[0], { part: 1, supported: false, quote: cooperation }];
  expect(sourceCheckIssue(rejected, 1, cooperation, draft)).toContain('사실 확인');
});

it('본문별 선택 형식은 지정 근거와 미확인만 허용하고 기존 개수 제한을 보존한다', () => {
  const response = { name: '검사', schema: { properties: {
    checks: { type: 'array', minItems: 2, maxItems: 2 }, quality: { type: 'object' },
  } } };
  const before = structuredClone(response);
  const result = sourceAffinitySchema(response, draft, [ceremony, cooperation]);
  const schema = result.schema.properties.checks as typeof before.schema.properties.checks & {
    items: { anyOf: { properties: { part: { enum: number[] }; quoteIndex: { enum: number[] } } }[] };
  };
  expect(schema.minItems).toBe(2); expect(schema.maxItems).toBe(2);
  expect(schema.items.anyOf[0].properties.quoteIndex.enum).toEqual([-1, 0, 1]);
  expect(schema.items.anyOf[1].properties.part.enum).toEqual([1]);
  expect(schema.items.anyOf[1].properties.quoteIndex.enum).toEqual([-1, 1]);
  expect(response).toEqual(before);
});

it('원문에 없는 본문 근거에는 미확인 번호만 제공한다', () => {
  const response = { name: '검사', schema: { properties: { checks: {} } } };
  const result = sourceAffinitySchema(response, draft, [ceremony]);
  const schema = result.schema.properties.checks as { items: { anyOf: { properties: { quoteIndex: { enum: number[] } } }[] } };
  expect(schema.items.anyOf[1].properties.quoteIndex.enum).toEqual([-1]);
});
