import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mocks.callLLM, parseJSONResponse: JSON.parse }));
import { generatePolicyGuide } from '@/lib/policy/ai-guide';
beforeEach(() => { mocks.callLLM.mockReset(); });
it('짧은 요약만 있는 자료로 설명을 만들어 비용을 쓰지 않는다', async () => {
  const guide = await generatePolicyGuide({ title: '월세 지원', summary: '청년 지원', category: '주거', target: '청년' });
  expect(mocks.callLLM).not.toHaveBeenCalled();
  expect(guide.tips).toBeNull();
});
