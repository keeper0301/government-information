// ============================================================
// 블로그 카테고리 chip 7종 — 홈/blog 페이지 SEO 동선 강화
// ============================================================
// /blog/category/[category] 7개 페이지 (87efc65 신설) 가 long-tail 키워드
// 검색 진입을 받으려면 사이트 내부 링크가 풍부해야 구글이 색인 가속.
// 홈 blog 섹션 위에 chip 7개 노출 → 사용자 클릭률 + SEO 동선 둘 다 ↑.
//
// 카테고리: publish-blog 의 요일 카테고리 7종과 일치.
// /blog/category/[category]/page.tsx 의 VALID_CATEGORIES 와도 일치.
// ============================================================

import Link from "next/link";
import { BLOG_CATEGORIES } from "@/lib/blog-categories";

export function BlogCategoryChips() {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {BLOG_CATEGORIES.map((c) => (
        <Link
          key={c}
          href={`/blog/category/${encodeURIComponent(c)}`}
          className="px-3.5 py-1.5 rounded-full bg-grey-100 text-[13px] font-semibold text-grey-700 hover:bg-blue-50 hover:text-blue-700 transition-colors no-underline"
        >
          {c}
        </Link>
      ))}
    </div>
  );
}
