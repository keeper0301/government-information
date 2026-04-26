// ============================================================
// 블로그 카테고리별 시각 토큰 (커버 fallback·OG 이미지·hero 공유)
// ============================================================
// blog_posts.cover_image 가 NULL 이어도 카테고리 색상 그라디언트로
// 시각 요소가 비지 않게 함. AdSense 검수자에게 "낮은 가치" 신호로
// 비춰지는 이미지 부재 문제 해소 + 시각적 카테고리 식별성 향상.
//
// OG 이미지 (app/blog/[slug]/opengraph-image.tsx) 와 동일 색상이라
// 소셜 공유·카드·상세 페이지가 일관된 톤으로 정렬됨.
// ============================================================

// 카테고리 별 두 색상 (그라디언트 시작·끝). OG 이미지 단색 팔레트와
// 시작값을 동일하게 두고, 끝값은 같은 색 계열의 더 진한 톤으로 설정.
export const CATEGORY_GRADIENTS: Record<
  string,
  { from: string; to: string; label: string }
> = {
  청년:        { from: "#3182F6", to: "#1B64DA", label: "청년" },
  소상공인:     { from: "#A234C7", to: "#7B1FA2", label: "소상공인" },
  주거:        { from: "#03B26C", to: "#028A55", label: "주거" },
  "육아·가족":  { from: "#EC4899", to: "#BE185D", label: "육아·가족" },
  노년:        { from: "#FE9800", to: "#D97706", label: "노년" },
  "학생·교육":  { from: "#18A5A5", to: "#0F7B7B", label: "학생·교육" },
  큐레이션:     { from: "#6B7684", to: "#4E5968", label: "큐레이션" },
};

// 매핑 안 된 카테고리 — 기본 toss blue
const DEFAULT_GRADIENT = {
  from: "#3182F6",
  to: "#1B64DA",
  label: "정책 블로그",
};

export function getCategoryGradient(category: string | null) {
  if (!category) return DEFAULT_GRADIENT;
  return CATEGORY_GRADIENTS[category] ?? DEFAULT_GRADIENT;
}

// CSS linear-gradient 문자열 — style={{ background }} 그대로 주입 가능
export function getCategoryGradientCss(category: string | null): string {
  const g = getCategoryGradient(category);
  return `linear-gradient(135deg, ${g.from} 0%, ${g.to} 100%)`;
}
