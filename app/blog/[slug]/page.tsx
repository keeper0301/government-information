// ============================================================
// /blog/[slug] — 블로그 글 상세
// ============================================================
// AdSense 승인용 핵심 페이지. E-E-A-T 충족:
//   - 명확한 출처 (정부 공식 데이터)
//   - 저자 정보 ("정책알리미 편집팀")
//   - 마지막 업데이트 날짜
//   - 구조화 데이터 (Article + FAQPage)
//   - 내부 링크 (관련 글)
//   - 사용자 가치 (정책 신청 가이드)
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArticleSchema, FAQSchema } from "@/components/json-ld";
import { formatKoreanDate } from "@/lib/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";

type FaqItem = { question: string; answer: string };

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content: string;          // markdown 또는 HTML
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  faqs: FaqItem[] | null;
  reading_time_min: number | null;
  cover_image: string | null;
  published_at: string | null;
  updated_at: string;
  view_count: number;
};

// 빌드 시점 + 동적 생성 패턴: 정적 메타 태그
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, meta_description, published_at, updated_at, tags, cover_image")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!post) {
    return { title: "글을 찾을 수 없어요 | 정책알리미" };
  }

  return {
    title: `${post.title} | 정책알리미`,
    description: post.meta_description || undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.meta_description || undefined,
      type: "article",
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at,
      tags: post.tags || undefined,
      images: post.cover_image ? [post.cover_image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.meta_description || undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!data) notFound();
  const post = data as BlogPost;

  // 같은 카테고리의 다른 최신 글 3개 (내부 링크용)
  const { data: relatedRaw } = await supabase
    .from("blog_posts")
    .select("slug, title, category, published_at")
    .not("published_at", "is", null)
    .neq("slug", post.slug)
    .eq("category", post.category || "")
    .order("published_at", { ascending: false })
    .limit(3);
  const related = relatedRaw || [];

  const url = `${SITE_URL}/blog/${post.slug}`;
  const dateLabel = post.published_at ? formatKoreanDate(post.published_at) : "";
  const updatedLabel = formatKoreanDate(post.updated_at);

  return (
    <main className="min-h-screen bg-white pt-[80px] pb-20">
      {/* 구조화 데이터: Article */}
      <ArticleSchema
        title={post.title}
        description={post.meta_description || ""}
        url={url}
        datePublished={post.published_at || post.updated_at}
        dateModified={post.updated_at}
        tags={post.tags || undefined}
      />

      {/* 구조화 데이터: FAQPage (있을 때만) */}
      {post.faqs && post.faqs.length > 0 && <FAQSchema questions={post.faqs} />}

      <article className="max-w-[720px] mx-auto px-5">
        {/* 카테고리 + 날짜 */}
        <div className="flex items-center gap-2 mb-3 text-[13px] text-grey-500">
          {post.category && (
            <a
              href={`/blog?category=${encodeURIComponent(post.category)}`}
              className="px-2.5 py-1 text-[12px] font-semibold rounded-full bg-blue-50 text-blue-700 no-underline hover:bg-blue-100"
            >
              {post.category}
            </a>
          )}
          <span>{dateLabel}</span>
          {post.reading_time_min && (
            <>
              <span aria-hidden="true">·</span>
              <span>{post.reading_time_min}분 읽기</span>
            </>
          )}
        </div>

        {/* 제목 */}
        <h1 className="text-[28px] md:text-[34px] font-extrabold text-grey-900 leading-[1.3] tracking-[-0.5px] mb-4">
          {post.title}
        </h1>

        {/* 요약 (도입부) */}
        {post.meta_description && (
          <p className="text-[16px] md:text-[17px] text-grey-700 leading-[1.7] mb-8 pb-6 border-b border-grey-100">
            {post.meta_description}
          </p>
        )}

        {/* 본문 — markdown/HTML 렌더 */}
        <div
          className="blog-content text-[16px] text-grey-900 leading-[1.8]"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* FAQ 섹션 (구조화 데이터와 별개로 사용자에게도 보여줌) */}
        {post.faqs && post.faqs.length > 0 && (
          <section className="mt-10 pt-8 border-t border-grey-100">
            <h2 className="text-[22px] font-bold text-grey-900 mb-5">자주 묻는 질문</h2>
            <ul className="space-y-4">
              {post.faqs.map((faq, idx) => (
                <li key={idx} className="bg-grey-50 rounded-xl p-5">
                  <div className="text-[15px] font-bold text-grey-900 mb-2">
                    Q. {faq.question}
                  </div>
                  <div className="text-[14px] text-grey-700 leading-[1.7]">
                    A. {faq.answer}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 마무리 정보: 저자·출처·업데이트 (E-E-A-T) */}
        <footer className="mt-10 pt-6 border-t border-grey-100 text-[13px] text-grey-500 leading-[1.7]">
          <div>작성: <b className="text-grey-700">정책알리미 편집팀</b></div>
          <div>마지막 업데이트: {updatedLabel}</div>
          <div className="mt-2">
            본 글은 공공데이터포털(data.go.kr) 의 공식 정책 데이터를 기반으로 작성됐어요.
            정확한 신청 정보는 각 정책의 공식 페이지에서 다시 한 번 확인해주세요.
          </div>
        </footer>

        {/* 관련 글 (내부 링크) */}
        {related.length > 0 && (
          <section className="mt-12 pt-8 border-t border-grey-100">
            <h2 className="text-[18px] font-bold text-grey-900 mb-4">
              {post.category} 카테고리 다른 글
            </h2>
            <ul className="space-y-2.5">
              {related.map((r) => (
                <li key={r.slug}>
                  <a
                    href={`/blog/${r.slug}`}
                    className="block py-2.5 text-[15px] font-medium text-grey-900 hover:text-blue-600 no-underline"
                  >
                    → {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <div className="mt-12 bg-blue-50 rounded-2xl p-6 text-center">
          <h3 className="text-[16px] font-bold text-grey-900 mb-2">
            마감 놓치지 마세요
          </h3>
          <p className="text-[13px] text-grey-700 mb-4 leading-[1.6]">
            관심 있는 정책에 알림 등록하면 마감 7일 전 이메일로 알려드려요.
          </p>
          <a
            href="/recommend"
            className="inline-flex items-center min-h-[44px] px-5 text-[14px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
          >
            나에게 맞는 정책 찾기 →
          </a>
        </div>
      </article>
    </main>
  );
}
