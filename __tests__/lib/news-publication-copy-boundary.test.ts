import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

// 본문 밖 복사는 한 번 재작성하며, 남은 복사를 별도 사실 판정 전에 보류합니다.
const copied = '정부 발표는 청년 근로자에게 상담과 신청 절차를 구분해서 안내하고 개별 지원 확정 여부는 담당 기관이 따로 판단한다고 설명했습니다.';
const quote = '청년 근로자가 상담을 신청할 수 있습니다.';
const draft = { kind: 'application', title: '청년 근로자의 상담과 지원 확정 구분',
  question: '상담 대상이면 지원도 확정되나요?', answer: '상담을 신청하는 것과 실제 지원이 결정되는 과정은 구분해야 합니다.', audience: '청년 근로자',
  sections: [
    { heading: '상담 대상과 지원 결과', paragraphs: ['청년 근로자에게 상담을 안내한다는 설명만으로 개인의 혜택이 확정되지는 않습니다. 상담 접수와 지원 결정은 서로 다른 과정이므로 자신의 상황에 적용되는 안내를 각각 확인해야 합니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '신청 전에 물어볼 내용', paragraphs: ['키피오의 제안: 담당 창구에 현재 상담을 받을 수 있는지 문의하세요. 필요한 절차를 확인하는 것은 안내를 활용하는 방법이며 정부가 추가 자격을 정했다는 뜻은 아닙니다.'], quoteIndex: 0, caseIndex: -1 },
    { heading: '추측하지 않은 항목', paragraphs: ['이 자료에 없는 지원 금액과 준비 서류는 임의로 만들지 않습니다. 상담 안내와 실제 혜택을 구별해서 읽고, 개별 결정에 필요한 세부 조건은 담당 기관의 최신 안내에서 확인해야 합니다.'], quoteIndex: 0, caseIndex: -1 },
  ] };

it.each(['제목', '핵심 답변', '제목과 답변'])('본문 밖 복사가 재작성 후에도 남으면 보류한다: %s', async kind => {
  // 같은 문장을 두 번 쓰면 복사 검사보다 먼저 중복 검사에 걸리므로 서로 다른 원문 구절을 씁니다.
  const copiedAnswer = kind === '제목과 답변' ? copied.replace('정부 발표', '공식 안내') : copied;
  const invalid = { ...draft, ...(kind !== '핵심 답변' ? { title: copied } : {}),
    ...(kind !== '제목' ? { answer: copiedAnswer } : {}) };
  expect(copied.length).toBeGreaterThanOrEqual(50);
  expect(copied.length).toBeLessThanOrEqual(80);
  mock.call.mockResolvedValue(JSON.stringify(invalid));
  await expect(generateVerifiedNews({ title: '청년 상담 공식 안내',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148972915',
    body: `${quote} ${copied} ${copiedAnswer}`, hash: '합성 원문', publishedAt: '2026-10-06' }))
    .rejects.toThrow('원문 문장을 길게 그대로 옮겼습니다.');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(mock.call.mock.calls[0][0].responseSchema.name).toBe('policy_news_draft');
});
