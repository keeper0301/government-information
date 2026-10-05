import Link from "next/link";
import { getPublishedNews, getPublishedNewsReview } from "@/lib/editorial-news";
import type { EditorialNews } from "@/lib/editorial-news-data";
import { getGuides } from "@/lib/policy-guides";
import { safeJsonLd } from "@/lib/json-ld-safe";

export function EditorialNewsCards() {
  return <div className="grid gap-5 md:grid-cols-2">{getPublishedNews().map(article =>
    <article key={article.slug} className="rounded-2xl border border-grey-200 bg-white p-6">
      <p className="text-sm text-grey-600 mb-3">공식 발표 {article.sourcePublishedAt} · 출처 확인 {article.checkedAt}</p>
      <h2 className="text-xl font-bold mb-3"><Link href={`/news/${article.slug}`} className="no-underline hover:text-blue-600">{article.title}</Link></h2>
      <p className="text-grey-700 leading-relaxed">{article.answer}</p>
      <p className="text-sm text-grey-600 mt-4">대상: {article.audience}</p>
    </article>
  )}</div>;
}

export function EditorialNewsIndex() {
  const articles = getPublishedNews();
  return <main className="max-w-content mx-auto px-6 pt-28 pb-16">
    <p className="text-sm text-blue-600 mb-3">키피오 · 정책 변화와 확인할 행동</p>
    <h1 className="text-3xl font-extrabold mb-5">정책뉴스</h1>
    <p className="max-w-3xl text-grey-700 leading-relaxed mb-8">공식 발표에서 무엇이 바뀌었는지, 누구에게 해당하는지, 무엇을 확인해야 하는지 정리합니다. 출처 대조와 운영자 검수를 거친 글만 공개합니다.</p>
    {articles.length ? <EditorialNewsCards /> : <section className="rounded-2xl bg-blue-50 p-6">
      <h2 className="text-xl font-bold mb-3">정책뉴스를 검수하고 있습니다</h2>
      <p className="leading-relaxed text-grey-700 mb-4">공식 발표와 신청 조건을 대조한 뒤 소식을 안내하겠습니다. 신청 준비가 필요하다면 먼저 공개된 가이드를 확인하세요.</p>
      <Link href="/guides" className="text-blue-600 underline">신청 가이드 보기 →</Link>
    </section>}
    <p className="mt-8 text-sm text-grey-600"><Link href="/source-policy" className="underline">출처 기준</Link> · <Link href="/correction-policy" className="underline">정정 절차</Link></p>
  </main>;
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
  const review = getPublishedNewsReview(article);
  const schema = review ? {
    "@context": "https://schema.org", "@type": "Article",
    headline: article.title, description: article.answer,
    datePublished: review.reviewedAt, dateModified: review.reviewedAt,
    author: { "@type": "Organization", name: "키피오 편집", url: "https://keepioo.com/about" },
    mainEntityOfPage: `https://keepioo.com/news/${article.slug}`, citation: article.sourceUrl,
  } : null;
  return <main className="max-w-3xl mx-auto px-6 pt-28 pb-16">
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />}
    <Link href="/news" className="text-blue-600 underline">정책뉴스 목록 →</Link>
    <article className="mt-6">
      <h1 className="text-3xl font-extrabold leading-snug mb-5">{article.title}</h1>
      <p className="text-sm text-grey-600 mb-5">작성: 키피오 편집 · 공식 발표 {article.sourcePublishedAt} · 출처 확인 {article.checkedAt} · 내용 수정 {article.updatedAt}</p>
      {review && <p className="text-sm text-grey-600 mb-5">키피오 발행·검수일: {review.reviewedAt.slice(0, 10)} · 검수: {review.reviewer}</p>}
      <h2 className="text-xl font-bold mb-3">{article.question}</h2>
      <p className="rounded-2xl bg-blue-50 p-6 leading-relaxed mb-6">{article.answer}</p>
      <p className="text-grey-600 mb-8">대상: {article.audience}</p>
      {article.sections.map(section => <section key={section.heading} className="mb-9">
        <h2 className="text-2xl font-bold mb-4">{section.heading}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph} className="text-grey-700 leading-[1.9] mb-4">{paragraph}</p>)}
      </section>)}
      <aside className="border-t border-grey-200 pt-6">
        <h2 className="font-bold text-xl mb-3">공식 근거와 정정</h2>
        <p className="leading-relaxed mb-3">{article.sourceAgency} · 발표 {article.sourcePublishedAt} · 확인 {article.checkedAt}</p>
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{article.sourceTitle} — 공식 원문 보기</a>
        <p className="text-sm text-grey-600 leading-relaxed mt-4">공식 자료의 사실과 키피오의 점검·안내 예시를 구분해 작성했습니다. 원문 사진과 본문 전체는 옮기지 않았습니다. 오류는 <Link href="/contact" className="underline">문의하기</Link>로 알려주세요.</p>
        {guide && <p className="mt-6"><Link href={`/guides/${guide.slug}`} className="text-blue-600 underline">함께 확인할 가이드: {guide.title}</Link></p>}
      </aside>
    </article>
  </main>;
}
