// ============================================================
// /news/[slug] — 정책 뉴스 상세 페이지
// ============================================================
// 본문 표시 + 공공누리 출처 표기 + 원문 링크 CTA + 공유 버튼 + 조회수 증가.
// 이미지 재호스팅 금지 (공공누리 제1유형) — 썸네일은 korea.kr 절대경로 그대로.
// Phase 2-B 에서 관련 공고 매칭 · JSON-LD · AdSense 추가 예정.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShareButton } from "@/components/share-button";
import { RelatedPrograms } from "@/components/related-programs";
import {
  NEWS_CATEGORY_LABEL,
  NEWS_CATEGORY_COLOR,
  type NewsCategory,
} from "@/components/news-card";
import { cleanDescription, formatKoreanDate } from "@/lib/utils";
import { findRelatedPrograms } from "@/lib/news-matching";

export const revalidate = 3600; // 상세는 갱신 적어 1시간 ISR

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_posts")
    .select("title, summary, thumbnail_url")
    .eq("slug", slug)
    .single();

  if (!data) return { title: "정책 소식 — 정책알리미" };
  return {
    title: `${data.title} | 정책알리미`,
    description: data.summary || undefined,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      title: data.title,
      description: data.summary || undefined,
      images: data.thumbnail_url ? [{ url: data.thumbnail_url }] : undefined,
      type: "article",
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("news_posts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!post) notFound();

  // 조회수 증가 (fire-and-forget) — 실패해도 상세 렌더에는 영향 없음
  supabase
    .rpc("increment_view_count", {
      p_table_name: "news_posts",
      p_row_id: post.id,
    })
    .then(({ error }) => {
      if (error) console.error("view count error:", error);
    });

  const categoryLabel =
    NEWS_CATEGORY_LABEL[post.category as NewsCategory] ?? post.category;
  const categoryColor =
    NEWS_CATEGORY_COLOR[post.category as NewsCategory] ??
    "bg-grey-100 text-grey-700";
  const dateLabel = formatKoreanDate(post.published_at);
  const cleanedBody = post.body ? cleanDescription(post.body) : null;

  // 관련 공고 매칭 — 뉴스 keywords 기반으로 welfare/loan 에서 현재 신청 가능한
  // 공고 최대 4건 추천. keepioo USP: 뉴스 읽고 → 바로 신청 가능한 공고로 연결.
  const relatedPrograms =
    post.keywords && post.keywords.length > 0
      ? await findRelatedPrograms({ keywords: post.keywords, limit: 4 })
      : [];

  // JSON-LD Article schema — Google 뉴스·SEO 풍부한 결과용.
  // publisher 는 keepioo (우리가 큐레이션한 주체), author 는 원문 기관 (ministry 또는 정책브리핑).
  // 원문이 아닌 큐레이션임을 mainEntityOfPage + isBasedOn 으로 명시.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.summary || undefined,
    image: post.thumbnail_url || undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      "@type": "Organization",
      name: post.ministry || "대한민국 정책브리핑",
      url: "https://www.korea.kr",
    },
    publisher: {
      "@type": "Organization",
      name: "keepioo",
      url: baseUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/news/${post.slug}`,
    },
    isBasedOn: post.source_url,
    license: "https://www.kogl.or.kr/info/license.do#01-tab",
  };

  return (
    <main className="pt-28 pb-20 max-w-[760px] mx-auto px-10 max-md:px-6">
      {/* JSON-LD NewsArticle schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-grey-700 mb-6">
        <a
          href="/news"
          className="font-medium no-underline hover:text-blue-500 transition-colors"
        >
          정책 소식
        </a>
        <span className="mx-2 text-grey-600">&gt;</span>
        <span className="text-grey-900 font-medium">
          {post.title.length > 30
            ? post.title.substring(0, 30) + "..."
            : post.title}
        </span>
      </nav>

      {/* 배지: 카테고리 + 부처 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className={`text-[13px] font-semibold px-2.5 py-1 rounded-md ${categoryColor}`}
        >
          {categoryLabel}
        </span>
        {post.ministry && (
          <span className="text-[13px] font-semibold px-2.5 py-1 rounded-md bg-grey-100 text-grey-700">
            {post.ministry}
          </span>
        )}
      </div>

      {/* 제목 */}
      <h1 className="text-[32px] font-bold tracking-[-1.2px] text-grey-900 mb-3 max-md:text-[24px]">
        {post.title}
      </h1>

      {/* 메타: 발행일 + 조회수 */}
      <div className="flex items-center gap-3 mb-8 flex-wrap text-[13px] text-grey-600">
        <span>{dateLabel}</span>
        {post.view_count > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>조회 {post.view_count.toLocaleString()}회</span>
          </>
        )}
      </div>

      {/* 썸네일 — korea.kr 절대경로 그대로 (재호스팅 금지, eslint 예외) */}
      {post.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail_url}
          alt=""
          className="w-full aspect-[16/9] object-cover rounded-2xl mb-8 bg-grey-100"
        />
      )}

      {/* 본문 — cleanDescription 으로 HTML 엔티티·태그 정제 후 whitespace-pre-wrap */}
      {cleanedBody && (
        <div className="text-[16px] text-grey-900 leading-[1.8] whitespace-pre-wrap mb-10 max-md:text-[15px]">
          {cleanedBody}
        </div>
      )}

      {/* 원문 CTA — AdSense "original value" 정책상 전문 복사 노출보다 원문 유도가 안전 */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-6 mb-8">
        <div className="text-[15px] font-bold text-grey-900 mb-2">
          원문 보기 · 자세한 정보
        </div>
        <p className="text-[13px] text-grey-700 leading-[1.6] mb-4">
          이 뉴스는 공공누리 제1유형으로 개방된 정책브리핑(korea.kr) 자료를
          활용했어요. 사진·영상·첨부파일 등 전체 자료는 원문에서 확인할 수 있어요.
        </p>
        <a
          href={post.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-5 bg-blue-500 text-white text-[14px] font-semibold rounded-lg no-underline hover:bg-blue-600"
        >
          korea.kr 에서 보기
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      {/* 공유 */}
      <div className="mb-8">
        <ShareButton />
      </div>

      {/* 관련 공고 — keepioo 의 진짜 차별점. 뉴스 읽고 바로 신청 가능한 공고로. */}
      <RelatedPrograms
        programs={relatedPrograms}
        title="이 뉴스와 관련된 공고"
        hint="지금 신청 가능한 공고 중 이 뉴스의 키워드와 연결된 것들이에요."
      />

      {/* 라이선스 표기 — KOGL-Type1 의무 */}
      <p className="text-[12px] text-grey-600 leading-[1.6] text-center pt-8 border-t border-grey-100">
        본 자료는 공공누리 제1유형 (KOGL-Type1) 으로 개방된{" "}
        <a
          href={post.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-grey-700 underline hover:text-grey-900"
        >
          정책브리핑(korea.kr)
        </a>
        의 자료를 활용합니다. 출처표시 · 상업이용·변형 허용.
      </p>
    </main>
  );
}
