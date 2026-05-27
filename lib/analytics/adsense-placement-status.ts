// ============================================================
// AdSense placement 등록 상태 (2026-05-22)
// ============================================================
// 5 placement (home/list/detail/category/eligibility) 각 SLOT + LAYOUT env
// 등록 여부 + 진행률.
// 등록 = 위치별 ad unit 가동 / 미등록 = default fallback (NEXT_PUBLIC_ADSENSE_SLOT_INFEED).
//
// NEXT_PUBLIC_* env 는 빌드 시 inline 이라 서버에서도 process.env 접근 가능.
// ============================================================

export type AdsensePlacementStatus = {
  placement: string; // "home" / "list" / "detail" / "category" / "eligibility"
  label: string; // 한국어 라벨
  slotRegistered: boolean;
  layoutRegistered: boolean;
};

export type AdsensePlacementSummary = {
  placements: AdsensePlacementStatus[];
  registeredCount: number; // SLOT + LAYOUT 모두 등록된 placement 개수
  totalCount: number;
  defaultFallback: boolean; // default SLOT_INFEED 등록 여부 (false 면 광고 자체 미가동)
};

const PLACEMENTS: Array<{ key: string; label: string }> = [
  { key: "home", label: "홈" },
  { key: "list", label: "복지/대출/뉴스 목록" },
  { key: "detail", label: "대출/뉴스 상세" },
  { key: "category", label: "카테고리 hub / 키워드" },
  { key: "eligibility", label: "자격 진단 hub" },
  // 5/27 추가 — blog detail 본문 inline + news detail 본문 inline.
  { key: "article", label: "블로그·뉴스 본문 inline" },
];

function envHas(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

export function getAdsensePlacementSummary(): AdsensePlacementSummary {
  const placements: AdsensePlacementStatus[] = PLACEMENTS.map(
    ({ key, label }) => {
      const upper = key.toUpperCase();
      return {
        placement: key,
        label,
        slotRegistered: envHas(`NEXT_PUBLIC_ADSENSE_SLOT_${upper}`),
        layoutRegistered: envHas(`NEXT_PUBLIC_ADSENSE_LAYOUT_${upper}`),
      };
    },
  );
  const registeredCount = placements.filter(
    (p) => p.slotRegistered && p.layoutRegistered,
  ).length;
  const defaultFallback = envHas("NEXT_PUBLIC_ADSENSE_SLOT_INFEED");
  return {
    placements,
    registeredCount,
    totalCount: PLACEMENTS.length,
    defaultFallback,
  };
}
