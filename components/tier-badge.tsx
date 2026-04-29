// ============================================================
// TierBadge — 사용자 티어 시각화 배지
// ============================================================
// 마이페이지 계정 요약, 결제 페이지, 헤더 등에서 재사용.
// 티어별 색상은 의미를 직관적으로 전달:
//   free  → 회색 (기본)
//   basic → 파란색 (성장)
//   pro   → 황금색 + ✨ (프리미엄)
// 한국어 라벨은 lib/subscription 의 TIER_NAMES 단일 출처에서 가져온다.
// ============================================================

import { TIER_NAMES, type Tier } from "@/lib/subscription";

// 티어별 배경·텍스트·테두리 색 (Tailwind 클래스 문자열)
const TIER_STYLES: Record<Tier, string> = {
  free: "bg-grey-100 text-grey-700 border-grey-200",
  basic: "bg-blue-50 text-blue-700 border-blue-200",
  pro: "bg-amber-50 text-amber-700 border-amber-200",
};

// size:
//  - "sm" : 카드/리스트 옆 인라인 (기본)
//  - "md" : 마이페이지 머리, 결제 페이지 등 도드라져야 할 자리
export function TierBadge({
  tier,
  size = "sm",
}: {
  tier: Tier;
  size?: "sm" | "md";
}) {
  const sizeClass =
    size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${TIER_STYLES[tier]} ${sizeClass}`}
    >
      {/* 프로만 ✨ 이모지로 시각적 강조 */}
      {tier === "pro" && <span aria-hidden>✨</span>}
      {TIER_NAMES[tier]}
    </span>
  );
}
