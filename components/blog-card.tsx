// ============================================================
// BlogCard — 블로그 글 한 장 카드 (목록 페이지에서 사용)
// ============================================================
// 디자인 토큰은 home-recommend-card.tsx 패턴 따름.
// 카테고리 배지 + 제목 + 요약 + 날짜·읽기시간.
//
// 2026-04-24 shadcn Card 시맨틱 교체 — 비주얼 유지, 구조 정리.
// Link 를 최외곽에 유지하고 내부를 Card 로 구성 (SEO navigation + 시각적 구조).
// 카테고리는 Badge 로 교체.
// ============================================================

import Link from "next/link";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKoreanDate, stripHtmlTags } from "@/lib/utils";

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
    <Link href={`/blog/${post.slug}`} className="block no-underline">
      <Card className="bg-white rounded-3xl p-6 shadow-none hover:[box-shadow:0_8px_24px_rgba(17,24,39,0.06)] hover:-translate-y-0.5 transition-all duration-200 ring-0 gap-0 py-0 h-full">
        {post.category && (
          <CardHeader className="px-0 pb-0 mb-3 gap-0">
            <Badge
              variant="secondary"
              className="bg-blue-50 text-blue-700 hover:bg-blue-50 rounded-full px-2.5 py-1 text-[12px] font-semibold w-fit"
            >
              {post.category}
            </Badge>
          </CardHeader>
        )}

        <CardContent className="px-0 flex-1">
          {/* 제목 */}
          <h2 className="text-[18px] font-extrabold text-grey-900 mb-2 leading-[1.4] tracking-[-0.3px] line-clamp-2">
            {post.title}
          </h2>

          {/* 요약 — meta_description 에 가끔 <strong> 같은 raw HTML 태그가 섞여
              들어오는 사고가 있어 stripHtmlTags 로 엔티티·태그 정제.
              meta_description 은 한 줄 리드 문장이라 cleanDescription(다단) 보다
              stripHtmlTags(평문) 가 적합 (lib/utils.ts:125 주석). */}
          {post.meta_description && (
            <p className="text-[14px] text-grey-700 leading-[1.6] line-clamp-3">
              {stripHtmlTags(post.meta_description)}
            </p>
          )}
        </CardContent>

        <CardFooter className="px-0 pt-4 pb-0 border-t-0 bg-transparent rounded-none text-[13px] text-grey-600 gap-2">
          <span>{dateLabel}</span>
          {readingLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span>{readingLabel}</span>
            </>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
