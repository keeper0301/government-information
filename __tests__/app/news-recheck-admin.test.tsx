import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), single: vi.fn(), source: vi.fn() }));
vi.mock('@/lib/admin-auth-server', () => ({ requireAdminUser: mock.auth }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mock.from }) }));
vi.mock('@/lib/news-publication/source', () => ({ readOfficialNews: mock.source }));
vi.mock('next/navigation', () => ({ redirect: () => { throw Error('로그인 필요'); }, notFound: () => { throw Error('찾을 수 없음'); } }));
import Page from '@/app/admin/news/recheck/[id]/page';
const params = Promise.resolve({ id: '148973768' });
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ id: '관리자' });
  const query = { select: () => query, eq: () => query, maybeSingle: mock.single };
  mock.from.mockReturnValue(query);
  mock.single.mockResolvedValue({ data: { source_hash: '기존', article: { title: '한복문화주간', answer: '참여 예정',
    sections: [], checkedAt: '2026-10-20', sourceTitle: '공식 제목', sourceUrl: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973768' } } });
  mock.source.mockResolvedValue({ hash: '변경', body: '공식 본문' });
});
it('관리자 인증 전에는 비공개 자료와 공식 원문을 읽지 않는다', async () => {
  mock.auth.mockResolvedValue(null);
  await expect(Page({ params })).rejects.toThrow('로그인 필요');
  expect(mock.from).not.toHaveBeenCalled(); expect(mock.source).not.toHaveBeenCalled();
});
it('원문 변경을 알려주되 기사 상태나 확인일을 변경하지 않는다', async () => {
  const html = renderToStaticMarkup(await Page({ params }));
  expect(html).toContain('원문 내용이 바뀌었습니다');
  expect(html).toContain('현재 시행·신청 가능 여부를 자동으로 확정하지 않습니다');
  expect(mock.from).toHaveBeenCalledTimes(1);
});
it('원문 읽기 실패를 원문 동일로 표시하거나 내부 오류를 공개하지 않는다', async () => {
  mock.source.mockRejectedValue(new Error('비공개 상세 정보'));
  const html = renderToStaticMarkup(await Page({ params }));
  expect(html).toContain('다시 확인하지 못했습니다');
  expect(html).not.toContain('비공개 상세 정보');
});
