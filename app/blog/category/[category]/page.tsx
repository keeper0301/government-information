// ============================================================
// /blog/category/[category] — 블로그 카테고리별 SEO long-tail 페이지
// ============================================================
// 배경:
//   /blog?category=청년 (query string) 은 검색엔진이 같은 페이지의 변형으로
//   인식해 색인 점수가 분산됨. /blog/category/청년 (path) 으로 분리하면
//   고유 URL = 고유 SEO 페이지로 인식 → 카테고리별 long-tail 키워드
//   ("청년 정책", "노년 지원" 등) 검색 결과 매칭 가속.
//
//   네이버 D.I.A 알고리즘은 path-based URL 의 사이트 구조 신뢰도를
//   query-string 보다 높게 평가.
//
// 스키마:
//   - CollectionPage JSON-LD (검색 결과 리치 카드 가능)
//   - Article 카드 ItemList (검색엔진이 카드 리스트 이해)
//
// 노출:
//   - sitemap.xml 에 7 카테고리 페이지 등록
//   - /blog 의 기존 query string 방식도 유지 (회귀 0)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import {
  BLOG_CATEGORIES as VALID_CATEGORIES,
  isValidBlogCategory as isValidCategory,
  type BlogCategory as ValidCategory,
} from "@/lib/blog-categories";

// 카테고리별 SEO 메타 — 네이버 키워드 시그널 강화용 자연스러운 한글 문구.
// 짧은 카테고리 라벨 보다 "청년 정책 가이드" 같은 검색 친화적 phrasing.
const CATEGORY_META: Record<ValidCategory, { title: string; description: string }> = {
  "청년": {
    title: "청년 정책 가이드",
    description: "20·30대 청년을 위한 정책·지원금·창업·주거 가이드. 자격·신청 방법·마감 정리.",
  },
  "노년": {
    title: "노년 정책 가이드",
    description: "60대 이상 어르신을 위한 복지·의료·기초연금·돌봄 정책 가이드.",
  },
  "학생·교육": {
    title: "학생·교육 지원 가이드",
    description: "초·중·고·대학생 학비·장학금·교육비 지원 정책 가이드.",
  },
  "육아·가족": {
    title: "육아·가족 정책 가이드",
    description: "임산부·영유아·아동·다자녀 가족을 위한 양육비·산후조리·돌봄 정책.",
  },
  "주거": {
    title: "주거 지원 가이드",
    description: "전세자금·월세·청년주택·임대 정책 가이드. 자격·금리·한도 정리.",
  },
  "소상공인": {
    title: "소상공인 정책 가이드",
    description: "자영업자·소상공인 정책자금·창업·임차료 지원·세제 혜택 가이드.",
  },
  "건강·복지": {
    title: "건강·복지 정책 가이드",
    description: "건강보험·의료비·기초생활·차상위·장애인 지원 정책 가이드.",
  },
};

// 7 카테고리 SSG 빌드 (Next.js 16 패턴)
export async function generateStaticParams() {
  return VALID_CATEGORIES.map((c) => ({ category: c }));
}

export const dynamic = "force-static";
export const dynamicParams = false; // generateStaticParams 외 slug 는 자동 404 (SEO 위 빈 페이지 색인 차단)
export const revalidate = 600; // 10분 ISR (블로그 매일 7글 발행 즉시 반영)

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: rawCategory } = await params;
  const category = decodeURIComponent(rawCategory);

  if (!isValidCategory(category)) {
    return { title: "카테고리를 찾을 수 없어요 | 정책알리미" };
  }

  const meta = CATEGORY_META[category];
  return {
    title: `${meta.title} | 정책알리미`,
    description: meta.description,
    keywords: `${category}, ${meta.title}, 정책, 지원금, 신청 방법, 가이드`,
    alternates: { canonical: `/blog/category/${encodeURIComponent(category)}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/blog/category/${encodeURIComponent(category)}`,
    },
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { category: rawCategory } = await params;
  const category = decodeURIComponent(rawCategory);

  if (!isValidCategory(category)) notFound();

  const meta = CATEGORY_META[category];
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, title, meta_description, category, reading_time_min, published_at, cover_image")
    .eq("category", category)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  const list = (posts || []) as BlogCardData[];

  // CollectionPage + ItemList JSON-LD — 네이버·Google 검색 리치 카드 시그널
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.title,
    description: meta.description,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/blog/category/${encodeURIComponent(category)}`,
    isPartOf: {
      "@type": "WebSite",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.keepioo.com/blog/${p.slug}`,
        name: p.title,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-[1200px] mx-auto px-5">
        {/* 브레드크럼 */}
        <nav className="text-[13px] text-grey-600 mb-4" aria-label="breadcrumb">
          <Link href="/" className="hover:underline">홈</Link>
          <span className="mx-1.5">/</span>
          <Link href="/blog" className="hover:underline">정책 블로그</Link>
          <span className="mx-1.5">/</span>
          <span className="text-grey-900">{category}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
            {meta.title}
          </h1>
          <p className="mt-2 text-[15px] text-grey-700 leading-[1.6]">
            {meta.description}
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            총 {list.length}건 · 매일 새 가이드 발행
          </p>
        </header>

        {list.length === 0 ? (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center">
            <p className="text-grey-700">
              아직 {category} 카테고리에 발행된 글이 없습니다.
            </p>
            <Link
              href="/blog"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 블로그로 이동 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}

        {/* 다른 카테고리 링크 — 사용자 회유 + 내부 링크 SEO */}
        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 정책 카테고리
          </h2>
          <div className="flex flex-wrap gap-2">
            {VALID_CATEGORIES.filter((c) => c !== category).map((c) => (
              <Link
                key={c}
                href={`/blog/category/${encodeURIComponent(c)}`}
                className="px-4 py-2 rounded-full bg-white border border-grey-200 text-[14px] text-grey-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {CATEGORY_META[c].title}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
