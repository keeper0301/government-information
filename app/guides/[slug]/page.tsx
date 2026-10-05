import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuideBySlug, getRelatedGuides, getGuideDisplayDates } from "@/lib/policy-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import { getGuidePublication } from "@/lib/guide-publication";
import { GuideEvidencePanel } from "@/components/guide-evidence-panel";
import { GuideArticleBody } from "@/components/guide-article-body";
import { safeJsonLd } from "@/lib/json-ld-safe";

export const revalidate = 60;
interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) return { title: "가이드 없음 | 정책알리미", robots: { index: false } };
  const publication = getGuidePublication(guide);
  const dates = getGuideDisplayDates(guide);
  const description = publication.published ? guide.posts[0].replace(/\s+/g, " ").trim().slice(0, 120)
    : "공식 출처와 내용을 대조하며 편집 검수를 진행하고 있습니다.";
  return {
    title: `${guide.title} — 종합 가이드 | 정책알리미`, description,
    alternates: { canonical: `/guides/${slug}` },
    robots: { index: publication.published, follow: true },
    openGraph: {
      title: guide.title, description, type: publication.published ? "article" : "website",
      publishedTime: publication.published ? dates.publishedAt : undefined,
      modifiedTime: publication.published ? dates.updatedAt : undefined,
    },
  };
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();
  const publication = getGuidePublication(guide);
  // 기존 주소를 보존하고 검수 전 본문은 완성된 안내처럼 공개하지 않습니다.
  if (!publication.published) return (
    <main className="container mx-auto max-w-3xl px-4 py-8" data-content-ad-eligible="false">
      <Link href="/guides">← 가이드 목록</Link>
      <h1 className="mt-6 text-3xl font-bold">{guide.title}</h1>
      <p className="mt-6 rounded-xl bg-amber-50 p-5">편집 검수 중입니다. 공식 출처와 내용을 대조한 뒤 안내를 공개하겠습니다.</p>
      <p className="mt-4">현재 신청 가능 여부와 조건은 담당 기관의 최신 공고를 확인하세요.</p>
      <Link href="/contact" className="mt-6 inline-block text-blue-600 underline">문의하기</Link>
    </main>
  );
  const evidence = getGuideEvidence(guide)!;
  const dates = getGuideDisplayDates(guide);
  const related = await getRelatedGuides(guide.id, 3);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Article", headline: guide.title,
    description: evidence.answer, datePublished: dates.publishedAt, dateModified: dates.updatedAt,
    author: { "@type": "Organization", name: "키피오", url: "https://www.keepioo.com/about" },
    publisher: { "@type": "Organization", name: "키피오", url: "https://www.keepioo.com" },
  };
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8"
      data-content-ad-eligible={String(publication.adEligible)} data-content-ad-path={`/guides/${slug}`}
      data-editorial-reviewer={publication.reviewer} data-editorial-reviewed-at={publication.reviewedAt}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Link href="/guides" className="text-sm text-gray-500 hover:underline">← 가이드 목록</Link>
      <header className="mt-4 mb-6">
        <h1 className="text-3xl font-bold mb-2">{guide.title}</h1>
        <p className="text-sm text-gray-500">
          {dates.publishedAt ? `발행 ${dates.publishedAt.slice(0, 10)}` : "발행일 기록 없음"}
          {dates.updatedAt ? ` · 수정 ${dates.updatedAt.slice(0, 10)}` : ""}
        </p>
      </header>
      <article className="prose prose-gray max-w-none">
        <GuideEvidencePanel evidence={evidence} reviewer={publication.reviewer} reviewedAt={publication.reviewedAt} />
        <GuideArticleBody posts={guide.posts} headings={evidence.headings} />
      </article>
      {related.length > 0 && <section className="mt-12">
        <h2 className="text-lg font-semibold mb-4">관련 신청 가이드</h2>
        <ul className="space-y-3">{related.map(item => <li key={item.id}>
          <Link href={`/guides/${item.slug}`} className="block p-4 border rounded">{item.title}</Link>
        </li>)}</ul>
      </section>}
    </main>
  );
}
