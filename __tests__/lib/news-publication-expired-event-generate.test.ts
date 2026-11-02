import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';

afterEach(() => { mock.call.mockReset(); vi.useRealTimers(); });

it('기자 경험 왜곡은 재작성 후에도 초안 단계에서 보류한다', async () => {
  const body = '나 역시 이번 행사가 없었다면 궤를 직접 볼 기회가 없었을 것이다.';
  const draft = { kind: 'report', title: '전통 공예품의 생활 속 쓰임 소개',
    question: '전시에서는 무엇을 소개하나요?', answer: '전통공예품의 생활 속 다양한 쓰임을 소개합니다.', audience: '전통 공예에 관심 있는 시민',
    sections: ['관람 경험 소개', '전시품의 생활 쓰임', '공예품 협업 소개'].map(heading => ({
      heading, paragraphs: ['참관 시민들은 전통공예품과 생활의 연결을 깨달았다.'], quoteIndex: 0, caseIndex: -1,
    })) };
  mock.call.mockResolvedValue(JSON.stringify(draft));
  const error = await generateVerifiedNews({ title: '전승공예품 소개', body,
    url: 'https://www.korea.kr/news/reporterView.do?newsId=148974379', publishedAt: '2026-10-28', hash: '검사용' }).catch(error => error);
  expect(error.message).toContain('개인');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(error.evidence.reviewAudit.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ attempt: 2, stage: 'draft', status: 'held' }),
  ]));
  expect(error.evidence.reviewAudit.events.some((event: {stage: string}) => event.stage === 'facts')).toBe(false);
});

it('종료 일정의 현재형 안내를 재작성 후에도 보류하고 실제 검사 근거를 남긴다', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T02:10:00Z'));
  const body = '팝업스토어 행사는 10월 24일부터 29일까지 연희정음에서 열린다.';
  const draft = { kind: 'report', title: '전통 공예품의 생활 속 쓰임 소개',
    question: '전시에서는 무엇을 소개하나요?', answer: '전통공예품의 생활 속 다양한 쓰임을 소개합니다.', audience: '전통 공예에 관심 있는 시민',
    sections: ['행사 운영 정보', '전시품의 생활 쓰임', '공예품 협업 소개'].map(heading => ({
      heading, paragraphs: ['팝업스토어가 운영된다. 시민 누구나 무료로 입장할 수 있다.'], quoteIndex: 0, caseIndex: -1,
    })) };
  mock.call.mockResolvedValue(JSON.stringify(draft));
  const error = await generateVerifiedNews({ title: '전승공예품 소개', body,
    url: 'https://www.korea.kr/news/reporterView.do?newsId=148974379', publishedAt: '2026-10-28', hash: '검사용' }).catch(error => error);
  expect(error.message).toContain('행사 기간(2026-10-29)');
  expect(mock.call).toHaveBeenCalledTimes(2);
  expect(error.evidence.reviewAudit.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ attempt: 2, stage: 'sourceState', status: 'held' }),
  ]));
  expect(error.evidence.reviewAudit.events.some((event: {stage: string}) => event.stage === 'facts')).toBe(false);
});
