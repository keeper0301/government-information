import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createGuideDraft, approveGuide } from '@/lib/policy/evidence-guide';
const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], submit: vi.fn(), denied: vi.fn(), reviewMode: false, newsCount: 3, reads: vi.fn() }));
vi.mock('@/lib/adsense-review-mode', () => ({ get ADSENSE_REVIEW_MODE() { return mocks.reviewMode; } }));
vi.mock('@/lib/editorial-news', () => ({ getPublishedNews: () => Array.from({ length: mocks.newsCount }) }));
vi.mock('@/lib/cron-auth', () => ({ authorizeCronRequest: mocks.denied }));
vi.mock('@/lib/indexnow', () => ({ submitToIndexNow: mocks.submit }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  mocks.reads(table);
  const result = () => ({ data: table.endsWith('_programs') ? mocks.rows : [], error: null });
  const chain = { select: () => chain, not: () => chain, eq: () => chain,
    is: () => chain, order: () => chain, gte: () => chain, limit: () => chain,
    range: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
  return chain;
} }) }));
import { GET as bulk } from '@/app/api/indexnow-bulk-submit/route';
import { GET as recent } from '@/app/api/indexnow-submit-recent/route';
import { GET as stopped } from '@/app/api/cron/policy-insight-backfill/route';
beforeEach(() => { mocks.reviewMode = false; mocks.newsCount = 3; mocks.reads.mockClear(); mocks.submit.mockReset().mockResolvedValue([]); mocks.denied.mockReset().mockReturnValue(null); });
it('색인 알림은 현재 정책과 일치하는 승인 설명만 보낸다', async () => {
  const row = { id: '검수완료', title: '청년 월세', source_url: 'https://www.gwgs.go.kr/notice?id=1', description: '청년 월세' };
  const draft = createGuideDraft(row, { url: row.source_url, title: row.title,
    body: '고성군 거주 청년 대상입니다.', checkedAt: '2026-01-01' },
    [{ label: '대상', text: '거주 조건을 먼저 확인하세요.', quote: '고성군 거주 청년' }]);
  const guidance = approveGuide(row, draft, '운영자', new Date('2026-01-02'));
  mocks.rows = [{ ...row, policy_guidance: guidance },
    { ...row, id: '조건변경', description: '다른 조건', policy_guidance: guidance },
    { ...row, id: '구해설', unique_insight_at: '2026-01-02' }];
  await bulk(new NextRequest('https://www.keepioo.com/api/indexnow-bulk-submit?limit=3'));
  const urls = mocks.submit.mock.calls.flatMap(args => args[0] as string[]);
  expect(urls.some(url => url.endsWith('/검수완료'))).toBe(true);
  expect(urls.some(url => url.endsWith('/조건변경') || url.endsWith('/구해설'))).toBe(false);
  mocks.submit.mockClear();
  await recent(new NextRequest('https://www.keepioo.com/api/indexnow-submit-recent'));
  const recentUrls = mocks.submit.mock.calls.flatMap(args => args[0] as string[]);
  expect(recentUrls.some(url => url.endsWith('/검수완료'))).toBe(true);
  expect(recentUrls.some(url => url.endsWith('/조건변경') || url.endsWith('/구해설'))).toBe(false);
});
it('예전 자동 설명 작업은 인증을 유지하고 생성하지 않는다', async () => {
  expect(await (await stopped(new Request('https://www.keepioo.com'))).json()).toMatchObject({ published: 0 });
  const denied = new Response(null, { status: 401 }); mocks.denied.mockReturnValue(denied);
  expect(await stopped(new Request('https://www.keepioo.com'))).toBe(denied);
  expect(mocks.submit).not.toHaveBeenCalled();
});

it('심사 모드에서는 승인 정책도 조회·제출하지 않고 검수 뉴스 목록만 허용한다', async () => {
  mocks.reviewMode = true;
  await bulk(new NextRequest('https://www.keepioo.com/api/indexnow-bulk-submit?limit=3'));
  const urls = mocks.submit.mock.calls.flatMap(args => args[0] as string[]);
  expect(urls).toContain('https://www.keepioo.com/news');
  expect(urls.some(url => /\/(welfare|loan)(?:\/|$)/.test(url))).toBe(false);
  expect(mocks.reads).not.toHaveBeenCalled();
  mocks.submit.mockClear();
  await recent(new NextRequest('https://www.keepioo.com/api/indexnow-submit-recent'));
  expect(mocks.reads.mock.calls.flat()).not.toContain('welfare_programs');
  expect(mocks.reads.mock.calls.flat()).not.toContain('loan_programs');
  expect(mocks.submit).not.toHaveBeenCalled();
});
it('심사 모드에서 검수 뉴스가 부족한 목록은 대량 제출하지 않는다', async () => {
  mocks.reviewMode = true; mocks.newsCount = 2;
  await bulk(new NextRequest('https://www.keepioo.com/api/indexnow-bulk-submit?limit=3'));
  expect(mocks.submit.mock.calls.flatMap(args => args[0] as string[])).not.toContain('https://www.keepioo.com/news');
});
