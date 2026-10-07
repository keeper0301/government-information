import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublishedNews } from '@/lib/editorial-news';
import type { EditorialNews } from '@/lib/editorial-news-data';

// 예약 공개 결과를 읽으므로 글이 늘어도 코드 업로드가 필요하지 않습니다.
export const loadPublishedNews = cache(async (all = false): Promise<EditorialNews[]> => {
  const existing = getPublishedNews();
  try {
    const automatic: EditorialNews[] = [];
    const admin = createAdminClient();
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.from('editorial_news_publications')
        .select('article, news_posts!inner(is_hidden)').eq('status', 'published')
        .eq('news_posts.is_hidden', false).order('published_at', { ascending: false }).order('source_id')
        .range(offset, offset + 99);
      if (error) return existing;
      automatic.push(...(data ?? []).map(row => row.article as EditorialNews)
        .filter(article => article?.automaticPublication && /^policy-brief-\d{9}$/.test(article.slug)));
      if (!all || (data ?? []).length < 100) break;
    }
    return [...automatic, ...existing.filter(article => !automatic.some(other => other.slug === article.slug))];
  } catch { return existing; }
});

export async function loadPublishedNewsBySlug(slug: string) {
  const existing = getPublishedNews().find(article => article.slug === slug);
  if (existing || !/^policy-brief-\d{9}$/.test(slug)) return existing;
  try {
    const { data, error } = await createAdminClient().from('editorial_news_publications')
      .select('article, news_posts!inner(is_hidden)').eq('source_id', slug.replace('policy-brief-', ''))
      .eq('status', 'published').eq('news_posts.is_hidden', false).maybeSingle();
    return !error && data?.article?.slug === slug ? data.article as EditorialNews : undefined;
  } catch { return undefined; }
}
