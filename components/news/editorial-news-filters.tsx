import Link from "next/link";
import type { EditorialNews } from "@/lib/editorial-news-data";
import { BENEFIT_TAGS } from "@/lib/tags/taxonomy";
import { filterEditorialNews, NEWS_REGIONS, newsFilterUrl, normalizeNewsFilters, type NewsFilters } from "@/lib/editorial-news-filters";

export function EditorialNewsFilters({ articles, filters }: { articles: EditorialNews[]; filters: NewsFilters }) {
  const selected = normalizeNewsFilters(filters);
  const chipClass = (active: boolean) => `inline-flex items-center min-h-11 px-3 text-sm rounded-full no-underline ${active ? "bg-blue-600 text-white font-semibold" : "bg-grey-50 text-grey-700 border border-grey-100 hover:bg-grey-100"}`;
  return <>
    <form action="/news" method="get" className="flex flex-wrap items-end gap-3 mb-6" role="search">
      <div className="flex-1 min-w-0 basis-60">
        <label htmlFor="news-query" className="block text-sm font-semibold mb-2">정책뉴스 검색</label>
        <input id="news-query" name="q" type="search" defaultValue={selected.q} placeholder="제목이나 궁금한 내용 검색" className="w-full min-h-11 px-4 rounded-xl border border-grey-200 bg-white" />
      </div>
      {selected.benefit && <input type="hidden" name="benefit" value={selected.benefit} />}
      {selected.province && <input type="hidden" name="province" value={selected.province} />}
      <button type="submit" className="min-h-11 px-5 rounded-xl bg-blue-600 text-white font-semibold">검색</button>
      <Link href="/news" className="min-h-11 px-3 inline-flex items-center text-blue-600 underline">전체 보기</Link>
    </form>
    <section aria-label="뉴스 분야 필터" className="mb-6 bg-white rounded-2xl border border-grey-100 p-5">
      <h2 className="text-lg font-bold mb-4">분야로 찾기</h2>
      <div className="flex flex-wrap gap-2">
        <Link href={newsFilterUrl(selected, { benefit: "" })} aria-current={!selected.benefit ? "page" : undefined} className={chipClass(!selected.benefit)}>전체 분야</Link>
        {BENEFIT_TAGS.map(benefit => <Link key={benefit} href={newsFilterUrl(selected, { benefit })} aria-current={selected.benefit === benefit ? "page" : undefined} className={chipClass(selected.benefit === benefit)}>
          {benefit} ({filterEditorialNews(articles, { ...selected, benefit }).length})
        </Link>)}
      </div>
    </section>
    <section aria-label="뉴스 지역 필터" className="mb-8 bg-white rounded-2xl border border-grey-100 p-5">
      <h2 className="text-lg font-bold mb-3">지역으로 찾기</h2>
      <p className="text-sm text-grey-600 mb-4 leading-relaxed">지역을 선택하면 해당 지역 소식만 찾습니다. 전국 발표는 ‘전국’에서 확인하세요. 분야·지역 분류는 신청 자격을 뜻하지 않습니다.</p>
      <div className="flex flex-wrap gap-2">
        <Link href={newsFilterUrl(selected, { province: "" })} aria-current={!selected.province ? "page" : undefined} className={chipClass(!selected.province)}>전체 지역</Link>
        {NEWS_REGIONS.map(region => <Link key={region.code} href={newsFilterUrl(selected, { province: region.code })} aria-current={selected.province === region.code ? "page" : undefined} className={chipClass(selected.province === region.code)}>{region.name}</Link>)}
      </div>
    </section>
  </>;
}
