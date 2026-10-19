import { describe, expect, it, vi } from 'vitest';
import { EDITORIAL_NEWS } from '@/lib/editorial-news-data';
import { searchPublishedNews } from '@/lib/news-publication/search';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/editorial-news', async () => {
  const { EDITORIAL_NEWS } = await import('@/lib/editorial-news-data');
  return { getPublishedNews: () => [EDITORIAL_NEWS[0]] };
});

describe('전체 뉴스 검색과 한 화면 제한', () => {
  it('검색을 저장소에 전달하며 101번째 일치 기사도 표시한다', async () => {
    const article = { ...EDITORIAL_NEWS[0], slug: 'policy-brief-999999101', title: '101번째 고유기사', sections: [] };
    rpc.mockResolvedValueOnce({ data: { articles: [article], total: 1, allCount: 101, page: 1, counts: { 기타: 1 } }, error: null });
    const result = await searchPublishedNews({ q: '고유기사' });
    expect(rpc).toHaveBeenLastCalledWith('search_editorial_news', expect.objectContaining({ p_q: '고유기사', p_page: 1 }));
    expect(result.articles.map(row => row.slug)).toEqual([article.slug]);
    expect(result.allCount).toBe(102);
  });
  it('자동 글 끝에 편집 글을 이어 붙이고 중간 페이지에는 끼워 넣지 않는다', async () => {
    const articles = Array.from({ length: 12 }, (_, index) => ({ ...EDITORIAL_NEWS[0], slug: `policy-brief-${999999000 + index}` }));
    rpc.mockResolvedValueOnce({ data: { articles, total: 24, allCount: 24, page: 1, counts: {} } });
    expect((await searchPublishedNews({})).articles).toHaveLength(12);
    rpc.mockResolvedValueOnce({ data: { articles: [], total: 24, allCount: 24, page: 3, counts: {} } });
    expect((await searchPublishedNews({}, '3')).articles).toEqual([EDITORIAL_NEWS[0]]);
  });
  it('실패를 정상적인 빈 검색으로 숨기지 않고 잘못된 페이지를 정리한다', async () => {
    rpc.mockResolvedValueOnce({ error: { message: '실패' } });
    const result = await searchPublishedNews({}, '-5');
    expect(result.unavailable).toBe(true);
    expect(result.page).toBe(1);
    expect(result.articles).toHaveLength(1);
  });
});
