// ============================================================
// NewsCard — 정책 뉴스 한 장 카드 (목록 페이지 그리드용)
// ============================================================
// korea.kr 출처 뉴스 (공공누리 제1유형). 썸네일·카테고리 배지·부처·요약·날짜.
// 썸네일은 korea.kr 절대경로 그대로 — 재호스팅 금지라 next/image 안 씀.
//
// 2026-04-24 shadcn Card 시맨틱 교체 — 비주얼 유지, 구조 정리.
// ============================================================

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cleanDescription, formatKoreanDate } from "@/lib/utils";

export type NewsCategory = "news" | "press" | "policy-doc";

export type NewsCardData = {
  slug: string;
  title: string;
  summary: string | null;
  category: NewsCategory;
  ministry: string | null;
  /**
   * 원 언론사 도메인. 네이버 검색 수집분에만 채워짐 (예: "donga.com").
   * korea.kr 공공누리 수집분은 null — ministry 가 발신처 역할.
   * 저작권법 제37조 출처 명시 의무 충족용.
   */
  source_outlet: string | null;
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
    <Link href={`/news/${post.slug}`} className="block no-underline">
      <Card className="bg-white rounded-3xl overflow-hidden shadow-none hover:[box-shadow:0_8px_24px_rgba(17,24,39,0.06)] hover:-translate-y-0.5 transition-all duration-200 ring-0 gap-0 py-0 h-full">
        {/* 썸네일 — 있으면 이미지, 없으면 카테고리 색상 그라디언트 placeholder.
            alt="" : 뉴스 제목이 바로 아래 카드 안에 있어 스크린리더 중복 방지.
            next/image 미사용 이유: 공공누리 제1유형 재호스팅 금지 → Vercel 최적화
            캐시를 거치지 않도록 <img> 로 외부 URL 직접 참조 (메모리 원칙).
            placeholder: 카드 메타 영역에 카테고리 배지·제목이 이미 노출되니
            중복 회피하고 시각요소만 유지 (그라디언트 + 점·선 패턴).
            rounded-t-3xl 명시: Card 기본 *:img:first-child rounded-t-xl 덮어쓰기. */}
        {post.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full aspect-[16/9] object-cover bg-grey-100 rounded-t-3xl"
          />
        ) : (
          <div
            className={`relative w-full aspect-[16/9] rounded-t-3xl overflow-hidden ${categoryColor}`}
            aria-hidden="true"
          >
            {/* 미니멀 패턴 — 우측 상단 동심원, 좌측 하단 점선 */}
            <div className="absolute inset-0 opacity-40">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-current" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-current" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-current opacity-30" />
            </div>
          </div>
        )}

        <CardContent className="p-5 max-md:p-4">
          {/* 배지: 카테고리 + 부처(있을 때만) + 원 언론사(네이버 검색 수집분).
              shadcn Badge 로 일관성 확보, 기존 카테고리별 색상은 className 으로 유지.
              source_outlet 은 저작권법 제37조 출처 명시 — 네이버 검색 결과의
              원 언론사 도메인을 카드 단계에서 노출해 사용자가 출처를 인지하게 함. */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge
              variant="secondary"
              className={`${categoryColor} hover:${categoryColor} rounded-full px-2.5 py-0.5 text-[11px] font-semibold border-0`}
            >
              {categoryLabel}
            </Badge>
            {post.ministry && (
              <span className="text-[13px] text-grey-600 truncate max-w-[180px]">
                {post.ministry}
              </span>
            )}
            {post.source_outlet && (
              <span className="text-[12px] text-grey-500 truncate max-w-[160px]">
                · 출처 {post.source_outlet}
              </span>
            )}
          </div>

          {/* 제목 — 2줄 이상이면 생략. 카드 높이 통일 */}
          <h2 className="text-[16px] font-bold text-grey-900 mb-2 leading-[1.4] tracking-[-0.3px] line-clamp-2">
            {post.title}
          </h2>

          {/* 요약 — summary 가 비어있으면 아예 생략. cleanDescription 으로 HTML
              엔티티(&nbsp; 등)·태그 정제해서 raw 노출 방지. line-clamp 에 삽입된
              \n 은 CSS 가 자동으로 공백 처리. */}
          {post.summary && (
            <p className="text-[13px] text-grey-700 leading-[1.6] mb-3 line-clamp-2">
              {cleanDescription(post.summary)}
            </p>
          )}

          {/* 발행일 */}
          <div className="text-[13px] text-grey-600">{dateLabel}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
