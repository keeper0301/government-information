import Link from "next/link";
import { getPublishedNews, getPublishedNewsReview } from "@/lib/editorial-news";
import type { EditorialNews } from "@/lib/editorial-news-data";
import { getGuides } from "@/lib/policy-guides";
import { safeJsonLd } from "@/lib/json-ld-safe";
import { NewsCard } from "@/components/news-card";
import { EditorialPhotoCredit, EditorialPhotoFigure } from "@/components/news/editorial-news-photo";
import { getEditorialNewsPhoto } from "@/lib/editorial-news-images";
import { EditorialNewsFilters } from "@/components/news/editorial-news-filters";
import { EditorialAdditionalSources, verifiedAdditionalSources } from "@/components/news/editorial-news-sources";
import { EditorialNewsSections } from "@/components/news/editorial-news-sections";
import { filterEditorialNews, normalizeNewsFilters, type NewsFilters } from "@/lib/editorial-news-filters";

export function EditorialNewsCards({ articles = getPublishedNews() }: { articles?: EditorialNews[] } = {}) {
  return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{articles.map(article => {
    const photo = getEditorialNewsPhoto(article);
    return (
    <article key={article.slug}>
      <NewsCard post={{ slug: article.slug, title: article.title, summary: article.answer,
        category: "news", ministry: "키피오 편집", source_outlet: null,
        thumbnail_url: photo?.url ?? null, thumbnail_alt: photo?.alt,
        published_at: article.automaticPublication?.checkedAt ?? getPublishedNewsReview(article)?.publishedAt ?? getPublishedNewsReview(article)?.reviewedAt ?? article.updatedAt }} />
      <p className="text-sm text-grey-600 mt-3 leading-relaxed">공식 발표 {article.sourcePublishedAt} · 출처 확인 {article.checkedAt}</p>
      {photo && <EditorialPhotoCredit photo={photo} />}
    </article>
  ); })}</div>;
}

export function EditorialNewsIndex({ filters = {}, articles = getPublishedNews() }: { filters?: NewsFilters; articles?: EditorialNews[] } = {}) {
  const selected = normalizeNewsFilters(filters);
  const filtered = filterEditorialNews(articles, selected);
  return <main className="min-h-screen bg-grey-50 pt-28 pb-16"><div className="max-w-content mx-auto px-6 lg:px-10">
    <p className="text-sm text-blue-600 mb-3">키피오 · 정책 변화와 확인할 행동</p>
    <h1 className="text-3xl font-extrabold mb-5">정책뉴스</h1>
    <p className="max-w-3xl text-grey-700 leading-relaxed mb-8">공식 발표에서 무엇이 바뀌었는지, 누구에게 해당하는지, 무엇을 확인해야 하는지 정리합니다. 공식 원문을 대조하고 편집 검수 또는 자동 근거 검사를 통과한 글을 공개합니다.</p>
    <EditorialNewsFilters articles={articles} filters={selected} />
    {articles.length > 0 && <p role="status" className="text-sm text-grey-600 mb-5">검색 결과 {filtered.length}건 · 공개된 검수 뉴스 {articles.length}건</p>}
    {filtered.length ? <EditorialNewsCards articles={filtered} /> : articles.length ? <section className="rounded-2xl bg-white p-6 border border-grey-200">
      <h2 className="text-xl font-bold mb-3">조건에 맞는 정책뉴스가 없습니다</h2>
      <p className="text-grey-700 mb-4">다른 검색어를 입력하거나 분야·지역 선택을 해제해보세요.</p>
      <Link href="/news" className="text-blue-600 underline">전체 뉴스 보기 →</Link>
    </section> : <section className="rounded-2xl bg-blue-50 p-6">
      <h2 className="text-xl font-bold mb-3">정책뉴스를 검수하고 있습니다</h2>
      <p className="leading-relaxed text-grey-700 mb-4">공식 발표와 신청 조건을 대조한 뒤 소식을 안내하겠습니다. 신청 준비가 필요하다면 먼저 공개된 가이드를 확인하세요.</p>
      <Link href="/guides" className="text-blue-600 underline">신청 가이드 보기 →</Link>
    </section>}
    <p className="mt-8 text-sm text-grey-600"><Link href="/source-policy" className="underline">출처 기준</Link> · <Link href="/correction-policy" className="underline">정정 절차</Link></p>
  </div></main>;
}

export function UnreviewedNewsNotice() {
  return <main className="max-w-3xl mx-auto px-6 pt-28 pb-16">
    <h1 className="text-3xl font-bold mb-5">이 정책뉴스는 검수 중입니다</h1>
    <p className="leading-relaxed mb-6">공식 출처와 안내 내용을 대조하기 전에는 본문을 공개하지 않습니다. 공개된 정책뉴스나 신청 가이드를 확인해주세요.</p>
    <Link href="/news" className="text-blue-600 underline">정책뉴스 보기</Link> · <Link href="/guides" className="text-blue-600 underline">신청 가이드 보기</Link>
  </main>;
}

export async function EditorialNewsDetail({ article }: { article: EditorialNews }) {
  const guide = (await getGuides(50, { publicationOnly: true })).find(item => item.slug === article.guideSlug);
  const review = article.automaticPublication
    ? { reviewedAt: article.automaticPublication.checkedAt, reviewer: "자동 근거 검사·사실 대조" }
    : getPublishedNewsReview(article);
  const photo = getEditorialNewsPhoto(article);
  const additionalSources = verifiedAdditionalSources(article);
  const publishedAt = review && ('publishedAt' in review ? review.publishedAt ?? review.reviewedAt : review.reviewedAt);
  const schema = review ? {
    "@context": "https://schema.org", "@type": "Article",
    headline: article.title, description: article.answer,
    ...(photo ? { image: `https://www.keepioo.com${photo.url}` } : {}),
    datePublished: publishedAt, dateModified: article.editorialCorrection?.correctedAt ?? review.reviewedAt,
    author: { "@type": "Organization", name: "키피오 편집", url: "https://keepioo.com/about" },
    mainEntityOfPage: `https://keepioo.com/news/${article.slug}`,
    citation: additionalSources.length ? [article.sourceUrl, ...additionalSources.map(source => source.url)] : article.sourceUrl,
  } : null;
  return <main className="max-w-3xl mx-auto px-6 pt-28 pb-16">
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />}
    <Link href="/news" className="text-blue-600 underline">정책뉴스 목록 →</Link>
    <article className="mt-6">
      <h1 className="text-3xl font-extrabold leading-snug mb-5">{article.title}</h1>
      <p className="text-sm text-grey-600 mb-5">작성: 키피오 편집 · 공식 발표 {article.sourcePublishedAt} · 출처 확인 {article.checkedAt} · 내용 수정 {article.updatedAt}</p>
      {review && <p className="text-sm text-grey-600 mb-5">키피오 발행·확인일: {review.reviewedAt.slice(0, 10)} · 확인: {review.reviewer}</p>}
      {publishedAt && publishedAt !== review?.reviewedAt && <p className="text-sm text-grey-600 mb-5">최초 발행일: {publishedAt.slice(0, 10)}</p>}
      {article.editorialCorrection && <p className="text-sm text-grey-700 bg-blue-50 rounded-xl p-4 mb-5">
        원문 대조 정정 · {article.editorialCorrection.correctedAt.slice(0, 10)}: {article.editorialCorrection.summary}
      </p>}
      {photo ? <EditorialPhotoFigure photo={photo} /> : <p className="mb-6">
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">공식 기사에서 현장 사진 보기 →</a>
      </p>}
      <h2 className="text-xl font-bold mb-3">{article.question}</h2>
      <p className="rounded-2xl bg-blue-50 p-6 leading-relaxed mb-6">{article.answer}</p>
      <p className="text-grey-600 mb-8">대상: {article.audience}</p>
      {article.automaticPublication && <p className="text-sm text-grey-600 mb-6">자동 작성 후 원문 근거와 사실을 기계적으로 대조한 글입니다. 사람의 검수와 다르며, 실제 신청은 공식 기관의 최신 안내를 확인하세요.</p>}
      <EditorialNewsSections article={article} />
      <aside className="border-t border-grey-200 pt-6">
        <h2 className="font-bold text-xl mb-3">공식 근거와 정정</h2>
        <p className="leading-relaxed mb-3">{article.sourceAgency} · 발표 {article.sourcePublishedAt} · 확인 {article.checkedAt}</p>
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{article.sourceTitle} — 공식 원문 보기</a>
        <EditorialAdditionalSources article={article} />
        <p className="text-sm text-grey-600 leading-relaxed mt-4">공식 자료의 사실과 키피오의 점검·안내 예시를 구분해 작성했습니다. 원문 사진과 본문 전체는 옮기지 않았습니다. 오류는 <Link href="/contact" className="underline">문의하기</Link>로 알려주세요.</p>
        {guide && <p className="mt-6"><Link href={`/guides/${guide.slug}`} className="text-blue-600 underline">함께 확인할 가이드: {guide.title}</Link></p>}
      </aside>
    </article>
  </main>;
}
