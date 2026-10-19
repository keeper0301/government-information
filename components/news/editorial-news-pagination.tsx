import Link from 'next/link';
import { newsFilterUrl, type NewsFilters } from '@/lib/editorial-news-filters';

export function EditorialNewsPagination({ page, total, filters }: { page: number; total: number; filters: NewsFilters }) {
  const pages = Math.ceil(total / 12);
  if (pages < 2) return null;
  const url = (target: number) => {
    const base = newsFilterUrl(filters);
    return `${base}${base.includes('?') ? '&' : '?'}page=${target}`;
  };
  return <nav aria-label="정책뉴스 페이지 이동" className="flex items-center justify-center gap-5 mt-8">
    {page > 1 && <Link href={url(page - 1)} className="min-h-11 inline-flex items-center underline text-blue-600">이전 페이지</Link>}
    <span aria-current="page">{page} / {pages} 페이지</span>
    {page < pages && <Link href={url(page + 1)} className="min-h-11 inline-flex items-center underline text-blue-600">다음 페이지</Link>}
  </nav>;
}
