// ============================================================
// keepioo 블로그 → 워드프레스 REST API 형식 변환
// ============================================================
// 워드프레스 REST API 는 HTML 그대로 받지만 keepioo 백링크 footer 자동 삽입 필요.
// 네이버 큐 (lib/naver-blog/format.ts) 와 차이:
//   - 네이버: plain text (에디터 호환 안 됨) → 평문화 + 백링크
//   - 워드프레스: HTML 그대로 + footer HTML 추가 (에디터 호환)
//
// 백링크 효과:
//  - keepioo 상세 페이지 (rel=canonical 형태로 캐노니컬 정의)
//  - keepioo 추천 페이지 (/recommend)
//  - 워드프레스 → keepioo 백링크 = 도메인 권위 ↑
// ============================================================

export type BlogPostForWordPress = {
  /** keepioo blog_posts.slug — 백링크 URL 조립용 */
  slug: string;
  /** 글 제목 (워드프레스 post 의 title 필드) */
  title: string;
  /** SEO meta_description — excerpt 필드로 활용 */
  meta_description: string | null;
  /** 본문 HTML (sanitize 된 상태) */
  content: string;
  /** 태그 배열 (워드프레스 tags 필드) */
  tags: string[] | null;
  /** 카테고리 (워드프레스 categories 매핑용) */
  category: string | null;
};

export type WordPressPayload = {
  title: string;
  /** 워드프레스 status='publish' 즉시 발행. 'draft' 는 검토 후 수동 발행 */
  status: "publish" | "draft";
  /** content HTML — keepioo 백링크 footer 포함 */
  content: string;
  /** 사용자 화면의 글 요약 (메타 description 으로도 사용) */
  excerpt: string;
  /** 워드프레스 카테고리 slug 배열 (사전 매핑) */
  categories: string[];
  /** 워드프레스 태그 배열 (자동 생성됨) */
  tags: string[];
};

const KEEPIOO_BASE = "https://www.keepioo.com";

/**
 * keepioo 카테고리 → 워드프레스 카테고리 slug 매핑.
 * 워드프레스에 사전 등록되어 있어야 함 (사장님 1회 설정).
 * 매핑 안 된 카테고리는 "정책" fallback (기본 카테고리).
 *
 * export — invariant test 가 keys 가 CATEGORY_COLORS 와 일치하는지 검증.
 * 새 카테고리 추가 시 매핑 누락 → 워드프레스 "정책" silent fallback 차단.
 */
export const WORDPRESS_CATEGORY_MAP: Record<string, string> = {
  청년: "청년",
  소상공인: "소상공인",
  주거: "주거",
  "육아·가족": "육아가족",
  노년: "노년",
  "학생·교육": "교육",
  문화: "문화",
  큐레이션: "큐레이션",
};

/**
 * keepioo 블로그 → 워드프레스 REST API payload 변환.
 * HTML 본문 끝에 keepioo 백링크 footer 자동 삽입 (SEO + 도메인 권위 핵심).
 */
export function convertToWordPress(post: BlogPostForWordPress): WordPressPayload {
  const backlinkUrl = `${KEEPIOO_BASE}/blog/${post.slug}`;
  const recommendUrl = `${KEEPIOO_BASE}/recommend`;

  // 백링크 footer — HTML 그대로 (워드프레스가 sanitize 후 표시)
  const footer = `
<hr />
<p style="font-size: 14px; color: #4e5968; margin-top: 24px;">
  <strong>📌 더 자세한 자격·금액·신청 방법</strong><br />
  → <a href="${backlinkUrl}" rel="canonical" target="_blank">${backlinkUrl}</a>
</p>
<p style="font-size: 14px; color: #4e5968;">
  정책알리미 <a href="${KEEPIOO_BASE}" target="_blank">keepioo</a> 에서는 매일 새 정부 정책을 자동으로 정리해 드려요.
  1분 자격 진단으로 받을 수 있는 정책을 즉시 확인할 수 있어요.<br />
  → <a href="${recommendUrl}" target="_blank">나에게 맞는 정책 찾기</a>
</p>
`.trim();

  const content = `${post.content}\n\n${footer}`;

  // 워드프레스 카테고리 slug — keepioo 카테고리와 매핑
  const wpCategories = post.category ? [mapCategory(post.category)] : ["정책"];

  return {
    title: post.title,
    status: "publish", // 즉시 발행 (검토 큐 안 거침)
    content,
    excerpt: post.meta_description ?? post.title,
    categories: wpCategories,
    tags: post.tags ?? [],
  };
}

function mapCategory(keepiooCategory: string): string {
  return WORDPRESS_CATEGORY_MAP[keepiooCategory] ?? "정책";
}
