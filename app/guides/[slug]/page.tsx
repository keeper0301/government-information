// ============================================================
// /guides/[slug] — 정책 종합 가이드 상세
// ============================================================
// 5글 묶음 표시. 1편은 헤더 없이 본문 시작 (후킹 효과).
// 2-5편은 부제 헤더 + 본문.
// SEO: Article structured data (Schema.org JSON-LD), Metadata API.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuideBySlug, getRelatedGuides } from "@/lib/policy-guides";
import { safeJsonLd } from "@/lib/json-ld-safe";

export const revalidate = 60;

const POST_HEADERS: (string | null)[] = [
  null, // 1편은 헤더 없음
  "1편 — 자격 깊이",
  "2편 — 서류·신청 절차",
  "3편 — 체감 숫자 + 함정",
  "4편 — 마감 + 행동",
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) {
    return { title: "가이드 없음 | 정책알리미" };
  }
  const description = guide.posts[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return {
    title: `${guide.title} — 종합 가이드 | 정책알리미`,
    description,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: {
      title: `${guide.title} — 종합 가이드`,
      description,
      type: "article",
      images: guide.ogImageUrl ? [{ url: guide.ogImageUrl }] : undefined,
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt,
    },
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 본문 \n\n 단락 분리. URL 자동 감지 → 링크.
 */
function renderBody(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, i) => (
    <p key={i} className="mb-4 leading-relaxed whitespace-pre-line">
      {linkify(para)}
    </p>
  ));
}

function linkify(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();

  const related = await getRelatedGuides(guide.id, 3);

  // Schema.org Article structured data — 검색 노출 강화
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.posts[0].slice(0, 160),
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: {
      "@type": "Organization",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    publisher: {
      "@type": "Organization",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    image: guide.ogImageUrl ?? undefined,
  };

  // 가입 페이지 UTM
  const signupUrl =
    "https://www.keepioo.com/signup?utm_source=policy-bible-guide&utm_medium=organic&utm_campaign=policy-bible-guide-page";

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <Link href="/guides" className="text-sm text-gray-500 hover:underline">
        ← 가이드 목록
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-3xl font-bold mb-2">{guide.title}</h1>
        <div className="text-sm text-gray-500">
          {formatDate(guide.publishedAt)} · 5편 시리즈
        </div>
      </header>

      <article className="prose prose-gray max-w-none">
        {guide.posts.map((post, i) => (
          <section key={i} className="mb-8">
            {POST_HEADERS[i] && (
              <h2 className="text-xl font-semibold mb-3 mt-8">{POST_HEADERS[i]}</h2>
            )}
            {renderBody(post)}
          </section>
        ))}
      </article>

      <aside className="mt-12 p-6 border rounded-lg bg-gray-50">
        <p className="font-semibold mb-2">비슷한 정책 자동 알림 받고 싶으세요?</p>
        <p className="text-sm text-gray-600 mb-4">
          정책알리미는 사장님 조건에 맞는 정책을 자동으로 카톡·이메일로 보내드려요.
        </p>
        <a
          href={signupUrl}
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          정책알리미 가입하기
        </a>
      </aside>

      {related.length > 0 && (
        <section className="mt-12">
          <h3 className="text-lg font-semibold mb-4">다른 가이드</h3>
          <ul className="space-y-3">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/guides/${r.slug}`}
                  className="block p-4 border rounded hover:border-gray-400"
                >
                  <div className="text-xs text-gray-500 mb-1">
                    {formatDate(r.publishedAt)}
                  </div>
                  <div className="font-medium">{r.title}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
