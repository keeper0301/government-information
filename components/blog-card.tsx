// ============================================================
// BlogCard — 블로그 글 한 장 카드 (목록 페이지에서 사용)
// ============================================================
// 디자인 토큰은 home-recommend-card.tsx 패턴 따름.
// 카테고리 배지 + 제목 + 요약 + 날짜·읽기시간.
// ============================================================

import Link from "next/link";
import { formatKoreanDate } from "@/lib/utils";

export type BlogCardData = {
  slug: string;
  title: string;
  meta_description: string | null;
  category: string | null;
  reading_time_min: number | null;
  published_at: string | null;
  cover_image: string | null;
};

export function BlogCard({ post }: { post: BlogCardData }) {
  const dateLabel = post.published_at ? formatKoreanDate(post.published_at) : "발행 예정";
  const readingLabel = post.reading_time_min ? `${post.reading_time_min}분 읽기` : null;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block bg-white border border-grey-100 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-shadow no-underline"
    >
      {/* 카테고리 배지 */}
      {post.category && (
        <div className="mb-3">
          <span className="inline-block px-2.5 py-1 text-[12px] font-semibold rounded-full bg-blue-50 text-blue-700">
            {post.category}
          </span>
        </div>
      )}

      {/* 제목 */}
      <h2 className="text-[18px] font-extrabold text-grey-900 mb-2 leading-[1.4] tracking-[-0.3px] line-clamp-2">
        {post.title}
      </h2>

      {/* 요약 */}
      {post.meta_description && (
        <p className="text-[14px] text-grey-700 leading-[1.6] mb-4 line-clamp-3">
          {post.meta_description}
        </p>
      )}

      {/* 메타: 날짜 + 읽기시간 */}
      <div className="flex items-center gap-2 text-[12px] text-grey-600">
        <span>{dateLabel}</span>
        {readingLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span>{readingLabel}</span>
          </>
        )}
      </div>
    </Link>
  );
}
