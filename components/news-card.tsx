// ============================================================
// NewsCard — 정책 뉴스 한 장 카드 (목록 페이지 그리드용)
// ============================================================
// korea.kr 출처 뉴스 (공공누리 제1유형). 썸네일·카테고리 배지·부처·요약·날짜.
// 썸네일은 korea.kr 절대경로 그대로 — 재호스팅 금지라 next/image 안 씀.
// ============================================================

import Link from "next/link";
import { formatKoreanDate } from "@/lib/utils";

export type NewsCategory = "news" | "press" | "policy-doc";

export type NewsCardData = {
  slug: string;
  title: string;
  summary: string | null;
  category: NewsCategory;
  ministry: string | null;
  thumbnail_url: string | null;
  published_at: string;
};

// 카테고리 라벨·색상 — 상세·목록·홈 어디서든 통일되게 외부 재사용 가능하게 export
export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  news: "정책뉴스",
  press: "보도자료",
  "policy-doc": "정책자료",
};

// pill 배경·글자 색 조합 (WCAG AA 대비 확보)
export const NEWS_CATEGORY_COLOR: Record<NewsCategory, string> = {
  news: "bg-blue-50 text-blue-700",
  press: "bg-amber-50 text-amber-800",
  "policy-doc": "bg-purple-50 text-purple-700",
};

export function NewsCard({ post }: { post: NewsCardData }) {
  const categoryLabel = NEWS_CATEGORY_LABEL[post.category];
  const categoryColor = NEWS_CATEGORY_COLOR[post.category];
  const dateLabel = formatKoreanDate(post.published_at);

  return (
    <Link
      href={`/news/${post.slug}`}
      className="block bg-white border border-grey-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-shadow no-underline"
    >
      {/* 썸네일 — 있으면 이미지, 없으면 카테고리 색상 placeholder.
          alt="" : 뉴스 제목이 바로 아래 카드 안에 있어 스크린리더 중복 방지.
          next/image 미사용 이유: 공공누리 제1유형 재호스팅 금지 → Vercel 최적화
          캐시를 거치지 않도록 <img> 로 외부 URL 직접 참조 (메모리 원칙). */}
      {post.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full aspect-[16/9] object-cover bg-grey-100"
        />
      ) : (
        <div
          className={`w-full aspect-[16/9] grid place-items-center ${categoryColor}`}
          aria-hidden="true"
        >
          <span className="text-[14px] font-semibold opacity-70">
            {categoryLabel}
          </span>
        </div>
      )}

      <div className="p-5 max-md:p-4">
        {/* 배지: 카테고리 + 부처(있을 때만) */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={`inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${categoryColor}`}
          >
            {categoryLabel}
          </span>
          {post.ministry && (
            <span className="text-[12px] text-grey-600 truncate max-w-[180px]">
              {post.ministry}
            </span>
          )}
        </div>

        {/* 제목 — 2줄 이상이면 생략. 카드 높이 통일 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-2 leading-[1.4] tracking-[-0.3px] line-clamp-2">
          {post.title}
        </h2>

        {/* 요약 — summary 가 비어있으면 아예 생략 */}
        {post.summary && (
          <p className="text-[13px] text-grey-700 leading-[1.6] mb-3 line-clamp-2">
            {post.summary}
          </p>
        )}

        {/* 발행일 */}
        <div className="text-[12px] text-grey-600">{dateLabel}</div>
      </div>
    </Link>
  );
}
