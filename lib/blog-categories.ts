// ============================================================
// 블로그 카테고리 single source — page route + chip 컴포넌트 공통
// ============================================================
// publish-blog 의 요일 카테고리 7종과 일치. 두 파일에 중복 정의돼있던
// 것을 single source 로 통합 (drift 위험 0).
//
// 변경 시 영향:
//   - app/blog/category/[category]/page.tsx — generateStaticParams + meta 매핑
//   - components/blog-category-chips.tsx — 홈 chip 노출
//   - publish-blog 요일 매핑 (.github/workflows/publish-blog.yml) 도 함께 검토
// ============================================================

export const BLOG_CATEGORIES = [
  "청년",
  "노년",
  "학생·교육",
  "육아·가족",
  "주거",
  "소상공인",
  "건강·복지",
] as const;

export type BlogCategory = typeof BLOG_CATEGORIES[number];

export function isValidBlogCategory(c: string): c is BlogCategory {
  return (BLOG_CATEGORIES as readonly string[]).includes(c);
}
