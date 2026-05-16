// ============================================================
// 블로그 카테고리별 시각 토큰 (커버 fallback·OG 이미지·hero 공유)
// ============================================================
// blog_posts.cover_image 가 NULL 이어도 카테고리 색상 그라디언트로
// 시각 요소가 비지 않게 함. AdSense 검수자에게 "낮은 가치" 신호로
// 비춰지는 이미지 부재 문제 해소 + 시각적 카테고리 식별성 향상.
//
// 디자인 일관성:
//   - from (시작 색) = 인스타 카드 / OG 이미지 / 네이버 썸네일 의 brand
//     카테고리 색 (`lib/instagram/card-colors` 단일 source of truth).
//   - to (끝 색)     = 같은 색 계열의 한 단계 darker shade (Tailwind 표준).
//   - Dead code 2 경로 anti-pattern 차단 — 인스타 카드 색 변경 시 그라디언트
//     from 도 자동 동기화 (2026-05-16 cleanup).
// ============================================================

import { getCategoryColor } from "@/lib/instagram/card-colors";

// 그라디언트 끝 색 (from 보다 어두운 톤). from 은 카테고리 brand color 라
// 별도 정의 X — 여기엔 to 만.
const CATEGORY_GRADIENT_TO: Record<string, string> = {
  청년: "#1B64DA",        // toss blue darker
  소상공인: "#7B1FA2",    // purple darker
  주거: "#065F46",        // emerald-800 (from emerald-700 #047857)
  "육아·가족": "#BE185D", // pink darker
  노년: "#D97706",        // amber-600 (from amber-500 #FE9800)
  "학생·교육": "#115E59", // teal-800 (from teal-700 #0F766E)
  문화: "#B45309",        // amber-700 (from yellow-500 #EAB308) — 2026-05-16 신규
  큐레이션: "#0F172A",    // gray-950 (from slate-800 #1F2937)
};

// 매핑 안 된 카테고리 — 기본 toss blue 그라디언트
const DEFAULT_GRADIENT = {
  from: "#3182F6",
  to: "#1B64DA",
  label: "정책 블로그",
};

export function getCategoryGradient(category: string | null) {
  if (!category) return DEFAULT_GRADIENT;
  const to = CATEGORY_GRADIENT_TO[category];
  if (!to) return DEFAULT_GRADIENT;
  return {
    from: getCategoryColor(category),
    to,
    label: category,
  };
}

// CSS linear-gradient 문자열 — style={{ background }} 그대로 주입 가능
export function getCategoryGradientCss(category: string | null): string {
  const g = getCategoryGradient(category);
  return `linear-gradient(135deg, ${g.from} 0%, ${g.to} 100%)`;
}
