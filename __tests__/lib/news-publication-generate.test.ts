import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';

it('작성자에게 보여주는 예시도 정확히 세 부분이며 한 부분 초안은 보류한다', async () => {
  mock.call.mockResolvedValue(JSON.stringify({ question: '무엇을 확인하나요?', answer: '공식 발표를 확인하세요.',
    audience: '정책 대상 시민', sections: [{ heading: '대상 확인', paragraphs: ['조건을 확인하세요.'], quote: '공식 발표입니다.' }] }));
  await expect(generateVerifiedNews({ title: '공식 발표', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: '공식 발표입니다.', hash: '원문 식별값', publishedAt: '2026-10-06' })).rejects.toThrow('세 부분의 형식');
  const prompt = mock.call.mock.calls[0][0].prompt as string;
  const example = JSON.parse(prompt.split('JSON 형식: ')[1]);
  expect(example.sections).toHaveLength(3);
  expect(mock.call).toHaveBeenCalledTimes(1);
});
