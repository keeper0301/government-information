// ============================================================
// 인스타 카드 카테고리 색상 + 본문 텍스트 색상 분기
// ============================================================
// route.tsx 에서 inline 되어 있던 표를 분리. 단위 테스트 (contrast) 와
// route 가 같은 표를 import 해서 회귀 방지. Dead code 2 경로 anti-pattern
// (env 기반 + 코드 기반 표 두 개) 차단.
//
// 핵심:
//   - CATEGORY_COLORS: 8 카테고리 hex (브랜드 톤)
//   - categoryTextColor(hex): YIQ luminance 130 threshold 로 어두운 글씨/밝은
//     글씨 분기 (light bg 위 white text 가 WCAG contrast 미달이라 어두운 글씨)
// ============================================================

// 카테고리 색상 — 블로그 OG 와 동일 (일관성)
export const CATEGORY_COLORS: Record<string, string> = {
  청년: "#3182F6",
  소상공인: "#A234C7",
  주거: "#047857", // emerald-700 — 기존 #03B26C + white text 가 WCAG 2.77:1 미달
                   // (2026-05-16 card-colors.test 검증). emerald-700 으로 5.74:1.
  "육아·가족": "#EC4899",
  노년: "#FE9800",
  "학생·교육": "#0F766E", // teal-700 — 기존 #18A5A5 + white text 가 WCAG 2.7:1
                          // contrast 미달 (2026-05-16 메모리 잠재 사고). teal-700 으로 5.36:1.
  문화: "#EAB308", // gold — 문화재 톤, 다른 카테고리와 차별 (2026-05-14 review 정리)
  큐레이션: "#1F2937", // slate-800 — #6B7684 회색 + white text 가 WCAG 2.15:1
                       // contrast 미달 (2026-05-16 v9 검수). slate-800 으로 9.4:1.
};

// 카테고리 대표 색상 lookup — 없는 카테고리는 청년색 fallback.
export function getCategoryColor(category: string | null | undefined): string {
  if (!category) return CATEGORY_COLORS["청년"];
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["청년"];
}

// 배경색이 밝은지 (YIQ luminance > 130) 판정.
// 노년 #FE9800, 문화 #EAB308 처럼 밝은 배경 위에 white text 면 contrast 미달.
export function isLightBg(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 130;
}

// 배경색 위에 올릴 본문 텍스트 색상 — 카드 2 (info card) 에서 사용.
// light bg → dark text (#191F28), dark bg → white text.
export function categoryTextColor(hex: string): "#FFFFFF" | "#191F28" {
  return isLightBg(hex) ? "#191F28" : "#FFFFFF";
}
