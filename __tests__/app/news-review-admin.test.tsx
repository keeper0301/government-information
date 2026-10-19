import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/admin-auth-server', () => ({ requireAdminUser: mock.auth }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mock.from }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw Error('로그인 필요'); } }));
import Page from '@/app/admin/news/review/page';
import { reviewLines } from '@/lib/news-publication/review-display';
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ id: '관리자' });
  mock.from.mockReturnValue({ select: () => ({ order: () => ({ limit: mock.limit }) }) });
});
it('관리자가 아니면 비공개 자료 조회 전에 차단한다', async () => {
  mock.auth.mockResolvedValue(null);
  await expect(Page()).rejects.toThrow('로그인 필요');
  expect(mock.from).not.toHaveBeenCalled();
});
it('이전 기록은 검사 통과로 표시하지 않고 보류 이유를 표시한다', async () => {
  mock.limit.mockResolvedValue({ data: [{ source_id: '148973397', status: 'held', reason: '원문에 없는 날짜', review_audit: null }] });
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain('검수 단계 기록 없음');
  expect(html).toContain('원문에 없는 날짜');
  expect(mock.limit).toHaveBeenCalledWith(100);
});
it('조회 오류를 빈 결과로 숨기지 않는다', async () => {
  mock.limit.mockResolvedValue({ error: { message: '비공개 내부 오류' } });
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain('불러오지 못했습니다');
  expect(html).not.toContain('비공개 내부 오류');
});
it('처리 자료가 없으면 빈 현황을 안내한다', async () => {
  mock.limit.mockResolvedValue({ data: [], error: null });
  expect(renderToStaticMarkup(await Page())).toContain('처리 기록이 없습니다.');
});
it('시도별 마지막 단계 상태를 보여주며 잘못된 기록을 무시한다', () => {
  const lines = reviewLines({ version: '검사용', events: [null, { attempt: 1, stage: '__proto__', status: 'passed' },
    { attempt: 1, stage: 'facts', status: 'started' }, { attempt: 1, stage: 'facts', status: 'held' },
    { attempt: 2, stage: 'facts', status: 'started' }] });
  expect(lines).toContain('1차 · 사실 대조: 보류');
  expect(lines).toContain('2차 · 사실 대조: 시작·완료 미확인');
  expect(lines.join()).not.toContain('본문 충실도 검사: 통과');
});
it('재시도 중이거나 이전 시도의 검수 기록이면 현재 통과로 표시하지 않는다', () => {
  const old = { checkedAt: '2026-10-18T01:00:00Z', events: [{ attempt: 1, stage: 'facts', status: 'passed' }] };
  for (const status of ['processing', 'held']) {
    const lines = reviewLines(old, '2026-10-19T01:00:00Z', status).join(' ');
    expect(lines).toContain('이번 시도의 검수 결과는 아직');
    expect(lines).not.toContain('사실 대조: 통과');
  }
});
