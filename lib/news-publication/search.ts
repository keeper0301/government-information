import { createAdminClient } from '@/lib/supabase/admin';
import { getPublishedNews } from '@/lib/editorial-news';
import type { EditorialNews } from '@/lib/editorial-news-data';
import { filterEditorialNews, normalizeNewsFilters, type NewsFilters } from '@/lib/editorial-news-filters';
import { BENEFIT_TAGS } from '@/lib/tags/taxonomy';
import { cache } from 'react';

export const NEWS_PAGE_SIZE = 12;
export interface NewsSearchPage {
  articles: EditorialNews[]; total: number; allCount: number; page: number;
  counts: Record<string, number>; unavailable?: boolean;
}

// 페이지의 검색 등록 정보와 목록이 같은 조회를 반복하지 않도록 한 요청 안에서 공유합니다.
const queryNewsPage = cache(async (q: string, benefit: string, province: string, status: string, page: number, staticCount: number) =>
  createAdminClient().rpc('search_editorial_news', { p_q: q, p_benefit: benefit, p_province: province,
    p_status: status, p_page: page, p_static_count: staticCount }));

export async function searchPublishedNews(filters: NewsFilters, pageInput?: string): Promise<NewsSearchPage> {
  const selected = normalizeNewsFilters(filters);
  const requested = /^\d{1,8}$/.test(pageInput ?? '') ? Math.max(1, Number(pageInput)) : 1;
  const existing = getPublishedNews().filter(article => !/^policy-brief-\d{9}$/.test(article.slug));
  const matched = filterEditorialNews(existing, selected);
  const counts = Object.fromEntries(BENEFIT_TAGS.map(benefit => [benefit, filterEditorialNews(existing, { ...selected, benefit }).length]));
  try {
    const { data, error } = await queryNewsPage(selected.q, selected.benefit, selected.province, selected.status, requested, matched.length);
    if (error || !data || !Array.isArray(data.articles)) throw new Error('뉴스 검색 결과를 읽지 못했습니다.');
    const offset = (data.page - 1) * NEWS_PAGE_SIZE;
    const localOffset = Math.max(0, offset - data.total);
    return {
      articles: [...data.articles, ...matched.slice(localOffset, localOffset + Math.max(0, NEWS_PAGE_SIZE - data.articles.length))],
      total: data.total + matched.length, allCount: data.allCount + existing.length, page: data.page,
      counts: Object.fromEntries(BENEFIT_TAGS.map(benefit => [benefit, (data.counts[benefit] ?? 0) + counts[benefit]])),
    };
  } catch {
    // 조회 실패를 검색 결과 없음으로 오해하지 않도록 화면에 별도 표시합니다.
    const page = Math.max(1, Math.min(requested, Math.ceil(matched.length / NEWS_PAGE_SIZE)));
    return { articles: matched.slice((page - 1) * NEWS_PAGE_SIZE, page * NEWS_PAGE_SIZE),
      total: matched.length, allCount: existing.length, page, counts, unavailable: true };
  }
}
