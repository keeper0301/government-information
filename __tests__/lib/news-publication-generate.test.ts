import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';

it('작성자에게 보여주는 예시도 정확히 세 부분이며 한 부분 초안은 보류한다', async () => {
  mock.call.mockResolvedValue(JSON.stringify({ question: '무엇을 확인하나요?', answer: '공식 발표를 확인하세요.',
    audience: '정책 대상 시민', sections: [{ heading: '대상 확인', paragraphs: ['조건을 확인하세요.'], quoteIndex: 0 }] }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: '공식 발표입니다.', hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('세 부분의 형식');
  const prompt = mock.call.mock.calls[0][0].prompt as string;
  const example = JSON.parse(prompt.split('JSON 형식: ')[1]);
  expect(example.sections).toHaveLength(3);
  expect(example.sections.every((section: { quoteIndex: number }) => Number.isInteger(section.quoteIndex))).toBe(true);
  expect(prompt).toContain('선택 가능한 원문 근거:');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it('선택한 근거 번호를 원문 그대로 연결하고 별도 사실 검사에도 전달한다', async () => {
  mock.call.mockReset();
  const quote = '청년 근로자가 신청할 수 있습니다.';
  const draft = { question: '대상을 어떻게 확인하나요?', answer: '신청 대상을 먼저 확인하세요.', audience: '청년 근로자',
    sections: ['대상 확인 방법', '신청 전 확인할 점', '확정할 수 없는 점'].map((heading, index) => ({
      heading, paragraphs: [(index === 0 ? '대상 조건을 살펴보세요' : index === 1 ? '발표 내용을 확인하세요' : '개별 판단은 구분하세요').repeat(20)], quoteIndex: 0 })) };
  mock.call.mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ supported: true, originalValue: true, issues: [] }));
  const result = await generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: quote, hash: '원문 식별값', publishedAt: '2026-10-06' });
  expect(result.sections.map(section => section.quote)).toEqual([quote, quote, quote]);
  expect(mock.call.mock.calls[1][0].prompt).toContain(quote);
  expect(mock.call).toHaveBeenCalledTimes(2);
});
