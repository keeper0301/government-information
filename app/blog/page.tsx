// ============================================================
// /blog — 블로그 글 목록
// ============================================================
// 발행된 (published_at IS NOT NULL) 글만, 최신순.
// 카테고리 필터 (?category=청년) 지원.
// AdSense 승인용 — 사용자에게 가치 있는 정보성 글 모음.
// ============================================================

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BlogCard, type BlogCardData } from "@/components/blog-card";

export const metadata: Metadata = {
  title: "정책 가이드 블로그 | 정책알리미",
  description:
    "복지·대출·지원금 신청 방법을 쉽게 정리한 가이드. 매일 1개씩 새 글 발행. 마감 임박 정책 큐레이션부터 청년·소상공인·주거 카테고리까지.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "정책 가이드 블로그 | 정책알리미",
    description: "복지·대출·지원금 신청 방법 가이드",
    type: "website",
  },
};

// 카테고리 표시용 (DB의 category 값과 매칭)
const CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "청년", label: "청년" },
  { key: "소상공인", label: "소상공인" },
  { key: "주거", label: "주거" },
  { key: "육아·가족", label: "육아·가족" },
  { key: "노년", label: "노년" },
  { key: "학생·교육", label: "학생·교육" },
  { key: "큐레이션", label: "큐레이션" },
];

type SearchParams = Promise<{ category?: string }>;

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category } = await searchParams;
  const activeCategory = category && category !== "all" ? category : "all";

  const supabase = await createClient();
  let query = supabase
    .from("blog_posts")
    .select("slug, title, meta_description, category, reading_time_min, published_at, cover_image")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  if (activeCategory !== "all") {
    query = query.eq("category", activeCategory);
  }

  const { data: posts } = await query;
  const list = (posts || []) as BlogCardData[];

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[920px] mx-auto px-5">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            정책 가이드 블로그
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
            복지·대출·지원금 신청 방법을 쉽게 정리해드려요. 매일 1개씩 새 글 올라옵니다.
          </p>
        </header>

        {/* 카테고리 필터 */}
        <nav className="flex flex-wrap gap-2 mb-8" aria-label="카테고리 필터">
          {CATEGORIES.map((cat) => {
            const selected = activeCategory === cat.key;
            return (
              <a
                key={cat.key}
                href={cat.key === "all" ? "/blog" : `/blog?category=${encodeURIComponent(cat.key)}`}
                className={`min-h-[36px] px-3.5 py-1.5 text-[13px] rounded-full no-underline transition-colors ${
                  selected
                    ? "bg-blue-500 text-white font-semibold"
                    : "bg-white text-grey-700 border border-grey-100 hover:bg-grey-50"
                }`}
              >
                {cat.label}
              </a>
            );
          })}
        </nav>

        {/* 글 목록 */}
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// 글 0개일 때 안내 (런칭 직후, 카테고리 필터 결과 없음 등)
function EmptyState() {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-10 text-center">
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        아직 발행된 글이 없어요
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6]">
        매일 1개씩 정책 가이드 글이 올라올 예정이에요.
        <br />
        먼저 복지·대출 정보 페이지를 살펴보세요.
      </p>
      <div className="flex justify-center gap-2 mt-5">
        <a
          href="/welfare"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
        >
          복지정보 보기
        </a>
        <a
          href="/loan"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-white border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
        >
          대출정보 보기
        </a>
      </div>
    </div>
  );
}
