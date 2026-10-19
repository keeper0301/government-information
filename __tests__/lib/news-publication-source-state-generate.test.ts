import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

it.each([
  ['학교 태양광 안전 확보 업무협약을 체결했다.', '협약 체결 예고'],
  ['앞으로 더 많은 학교에 검사가 확대될 전망이다.', '확대 여부 검토'],
])('자동 작성 경로에서 오류가 재작성 후에도 남으면 공개용 결과를 반환하지 않는다: %s', async (text, reason) => {
  const body = '교육부는 안전 확보 업무협약을 체결한다. 기존 학교로 확대 여부는 추후 검토할 예정이다.';
  const draft = { kind: 'change', title: '학교 태양광 안전검사 개선 안내',
    question: '어떤 학교가 우선 대상인가요?', answer: text, audience: '학교 시설 담당자',
    sections: ['협약 발표의 내용', '검사 지원의 내용', '대상 확대의 검토'].map(heading => ({
      heading, paragraphs: ['발표한 내용과 추후 검토할 범위를 구분해 안내한다.'], quoteIndex: 0, caseIndex: -1,
    })) };
  mock.call.mockResolvedValue(JSON.stringify(draft));
  await expect(generateVerifiedNews({ title: '학교 태양광 검사', body,
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973472',
    publishedAt: '2026-10-14', hash: '검사용' })).rejects.toThrow(reason);
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[1][0].prompt).toContain(reason);
});
