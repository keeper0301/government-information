// ============================================================
// 인스타 카드 카테고리 색상 + contrast 단위 테스트
// ============================================================
// 목표:
//   1) CATEGORY_COLORS 표 정의 (8 카테고리, 유효 hex)
//   2) isLightBg / categoryTextColor 분기 logic 정확성
//   3) 카드 2 body text 의 WCAG contrast ≥ 3:1 (AA Large for 18px+ bold)
//      — 학생·교육 #18A5A5 + white = 2.7:1 미달 잠재 사고 회귀 방지
//
// 2026-05-16 사장님 5/16 메가 세션 마감 시점에 메모리에 명시된 잠재 사고
// (instagram-card-readability-complete-2026-05-16.md) 를 fix 한 뒤 추가.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  BRAND_COLOR_ON_WHITE_VARIANT,
  getCategoryColor,
  isLightBg,
  categoryTextColor,
  categoryBadgeTextColor,
  categoryColorOnWhite,
} from "@/lib/instagram/card-colors";

// ── WCAG 2.1 relative luminance + contrast (테스트 전용 helper) ──────
// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return (
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  );
}

function contrast(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

// ── 표 정의 ──────────────────────────────────────────────────
describe("CATEGORY_COLORS 표 정의", () => {
  const EXPECTED = [
    "청년",
    "소상공인",
    "주거",
    "육아·가족",
    "노년",
    "학생·교육",
    "문화",
    "큐레이션",
  ];

  it.each(EXPECTED)("'%s' 카테고리가 표에 존재", (cat) => {
    expect(CATEGORY_COLORS[cat]).toBeDefined();
  });

  it("총 8 카테고리 (추가 시 의도 확인)", () => {
    expect(Object.keys(CATEGORY_COLORS).length).toBe(8);
  });

  it.each(Object.entries(CATEGORY_COLORS))(
    "'%s' 색 '%s' 가 #RRGGBB 형식",
    (_cat, hex) => {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    },
  );
});

// ── getCategoryColor fallback ────────────────────────────────
describe("getCategoryColor (lookup)", () => {
  it("알려진 카테고리 → 표 값", () => {
    expect(getCategoryColor("청년")).toBe("#3182F6");
    expect(getCategoryColor("학생·교육")).toBe("#0F766E");
  });

  it("알려지지 않은 카테고리 → 청년 색 fallback", () => {
    expect(getCategoryColor("이상한카테고리")).toBe("#3182F6");
  });

  it("null·undefined → 청년 색 fallback", () => {
    expect(getCategoryColor(null)).toBe("#3182F6");
    expect(getCategoryColor(undefined)).toBe("#3182F6");
  });

  it("빈 문자열 → 청년 색 fallback", () => {
    expect(getCategoryColor("")).toBe("#3182F6");
  });
});

// ── isLightBg 분기 (YIQ luminance 130 threshold) ─────────────
describe("isLightBg (YIQ luminance > 130)", () => {
  it("노년 #FE9800 → true (밝은 오렌지)", () => {
    expect(isLightBg("#FE9800")).toBe(true);
  });

  it("문화 #EAB308 → true (밝은 골드)", () => {
    expect(isLightBg("#EAB308")).toBe(true);
  });

  it("주거 #047857 → false (emerald-700, fix 후)", () => {
    // 기존 #03B26C YIQ 117 → white 분기지만 contrast 2.77:1 미달이었음.
    // emerald-700 #047857 YIQ 81 → 명확히 dark bg → white text 안전.
    expect(isLightBg("#047857")).toBe(false);
  });

  it("청년 #3182F6 → false (toss blue)", () => {
    expect(isLightBg("#3182F6")).toBe(false);
  });

  it("학생·교육 #0F766E → false (teal-700, fix 후)", () => {
    expect(isLightBg("#0F766E")).toBe(false);
  });

  it("큐레이션 #1F2937 → false (slate-800)", () => {
    expect(isLightBg("#1F2937")).toBe(false);
  });
});

// ── categoryTextColor (카드 2 body text 색상) ────────────────
describe("categoryTextColor (카드 2 본문 색 분기)", () => {
  it("노년 → dark text #191F28 (light bg 위 white text 미달)", () => {
    expect(categoryTextColor("#FE9800")).toBe("#191F28");
  });

  it("문화 → dark text #191F28", () => {
    expect(categoryTextColor("#EAB308")).toBe("#191F28");
  });

  it("청년 → white #FFFFFF", () => {
    expect(categoryTextColor("#3182F6")).toBe("#FFFFFF");
  });

  it("학생·교육 → white (teal-700 darker bg)", () => {
    expect(categoryTextColor("#0F766E")).toBe("#FFFFFF");
  });
});

// ── WCAG contrast — 카드 2 body text (가장 중요) ─────────────
describe("카드 2 body contrast ≥ 3:1 (WCAG AA Large for 18px+ bold)", () => {
  it.each(Object.entries(CATEGORY_COLORS))(
    "'%s' bg '%s' + 분기된 body color contrast ≥ 3:1",
    (_cat, bg) => {
      const body = categoryTextColor(bg);
      const c = contrast(bg, body);
      expect(c).toBeGreaterThanOrEqual(3.0);
    },
  );

  it("학생·교육 #0F766E + white 가 ≥ 4.5:1 (2026-05-16 잠재 사고 회귀 방지)", () => {
    // 기존 #18A5A5 + white = 2.7:1 (WCAG 미달).
    // teal-700 #0F766E + white ≈ 5.36:1 → AA Normal 까지 충족.
    const c = contrast("#0F766E", "#FFFFFF");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it("주거 #047857 + white 가 ≥ 4.5:1 (2026-05-16 잠재 사고 회귀 방지)", () => {
    // 기존 #03B26C + white = 2.77:1 (메모리 표가 dark 라 가정했지만 실제 코드는 white 분기).
    // emerald-700 #047857 + white ≈ 5.74:1 → AA Normal 충족.
    const c = contrast("#047857", "#FFFFFF");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it("큐레이션 #1F2937 + white 가 ≥ 7:1 (AAA, 2026-05-16 v10 회귀 방지)", () => {
    const c = contrast("#1F2937", "#FFFFFF");
    expect(c).toBeGreaterThanOrEqual(7.0);
  });
});

// ── categoryBadgeTextColor (카드 1·3 pill 배지) ──────────────
describe("categoryBadgeTextColor (카드 1 pill 배지 분기, YIQ > 150)", () => {
  it("노년 #FE9800 → dark (YIQ 165, 이전 white = 2.0:1 미달)", () => {
    expect(categoryBadgeTextColor("#FE9800")).toBe("#191F28");
  });

  it("문화 #EAB308 → dark (YIQ 176, 이전 white = 1.86:1 미달)", () => {
    expect(categoryBadgeTextColor("#EAB308")).toBe("#191F28");
  });

  it("육아·가족 #EC4899 → white 유지 (YIQ 130.3 < 150, contrast 3.4:1 AA Large)", () => {
    // 카드 2 body 분기 (threshold 130) 에서는 dark 지만, 카드 1 배지에서는
    // fontSize 32 bold pill 의 시각 emphasis 가 dominant 라 white 유지가 의도.
    expect(categoryBadgeTextColor("#EC4899")).toBe("#FFFFFF");
  });

  it("청년 #3182F6 → white (YIQ 119)", () => {
    expect(categoryBadgeTextColor("#3182F6")).toBe("#FFFFFF");
  });

  it("소상공인 #A234C7 → white (YIQ 102)", () => {
    expect(categoryBadgeTextColor("#A234C7")).toBe("#FFFFFF");
  });

  it("주거 #047857 → white (YIQ 81)", () => {
    expect(categoryBadgeTextColor("#047857")).toBe("#FFFFFF");
  });

  it("학생·교육 #0F766E → white (YIQ 86)", () => {
    expect(categoryBadgeTextColor("#0F766E")).toBe("#FFFFFF");
  });

  it("큐레이션 #1F2937 → white (YIQ 40)", () => {
    expect(categoryBadgeTextColor("#1F2937")).toBe("#FFFFFF");
  });
});

// ── WCAG contrast — 카드 1·3 pill 배지 ───────────────────────
describe("카드 1 pill 배지 contrast ≥ 3:1 (WCAG AA Large for 32px+ bold)", () => {
  it.each(Object.entries(CATEGORY_COLORS))(
    "'%s' bg '%s' + 분기된 badge text contrast ≥ 3:1",
    (_cat, bg) => {
      const text = categoryBadgeTextColor(bg);
      const c = contrast(bg, text);
      expect(c).toBeGreaterThanOrEqual(3.0);
    },
  );

  it("노년 #FE9800 + dark text 가 ≥ 4.5:1 (2026-05-16 잠재 사고 회귀 방지)", () => {
    // 기존 #FE9800 + white = 2.0:1 (WCAG 미달).
    // dark text #191F28 + #FE9800 ≈ 9.6:1 → AAA 충족.
    const c = contrast("#FE9800", "#191F28");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it("문화 #EAB308 + dark text 가 ≥ 4.5:1 (2026-05-16 잠재 사고 회귀 방지)", () => {
    // 기존 #EAB308 + white = 1.86:1 (WCAG 미달).
    // dark text #191F28 + #EAB308 ≈ 11.4:1 → AAA 충족.
    const c = contrast("#EAB308", "#191F28");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });
});

// ── categoryColorOnWhite (카드 1·2·3 의 white bg 위 brand text) ──
describe("categoryColorOnWhite (white 배경 위 안전한 brand text 색)", () => {
  it("노년 #FE9800 → #B45309 amber-700 (이전 white bg + #FE9800 = 2.0:1 미달)", () => {
    expect(categoryColorOnWhite("#FE9800")).toBe("#B45309");
  });

  it("문화 #EAB308 → #92400E amber-800 (이전 white bg + #EAB308 = 1.86:1 미달)", () => {
    expect(categoryColorOnWhite("#EAB308")).toBe("#92400E");
  });

  it("청년 #3182F6 → 그대로 (이미 white bg 위 4.5:1 충족)", () => {
    expect(categoryColorOnWhite("#3182F6")).toBe("#3182F6");
  });

  it("소상공인 #A234C7 → 그대로", () => {
    expect(categoryColorOnWhite("#A234C7")).toBe("#A234C7");
  });

  it("주거 #047857 → 그대로 (5.74:1)", () => {
    expect(categoryColorOnWhite("#047857")).toBe("#047857");
  });

  it("육아·가족 #EC4899 → 그대로 (3.4:1 AA Large 충족)", () => {
    expect(categoryColorOnWhite("#EC4899")).toBe("#EC4899");
  });

  it("학생·교육 #0F766E → 그대로 (5.36:1)", () => {
    expect(categoryColorOnWhite("#0F766E")).toBe("#0F766E");
  });

  it("큐레이션 #1F2937 → 그대로 (12.9:1)", () => {
    expect(categoryColorOnWhite("#1F2937")).toBe("#1F2937");
  });
});

// ── WCAG contrast — white bg 위 brand text (4 위치: 카드 1·2·3) ──
describe("white bg 위 categoryColorOnWhite contrast ≥ 3:1 (WCAG AA Large)", () => {
  it.each(Object.entries(CATEGORY_COLORS))(
    "'%s' brand text on white contrast ≥ 3:1",
    (_cat, bg) => {
      const text = categoryColorOnWhite(bg);
      const c = contrast(text, "#FFFFFF");
      expect(c).toBeGreaterThanOrEqual(3.0);
    },
  );

  it("노년 amber-700 #B45309 + white 가 ≥ 4.5:1 (2026-05-16 회귀 방지)", () => {
    // 기존 #FE9800 + white = 2.0:1 → amber-700 #B45309 + white ≈ 5.04:1 (AA Normal).
    const c = contrast("#B45309", "#FFFFFF");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it("문화 amber-800 #92400E + white 가 ≥ 4.5:1 (2026-05-16 회귀 방지)", () => {
    // 기존 #EAB308 + white = 1.86:1 → amber-800 #92400E + white ≈ 7.13:1 (AAA).
    const c = contrast("#92400E", "#FFFFFF");
    expect(c).toBeGreaterThanOrEqual(4.5);
  });
});

// ── invariant: BRAND_COLOR_ON_WHITE_VARIANT keys ⟷ CATEGORY_COLORS values ──
describe("BRAND_COLOR_ON_WHITE_VARIANT keys 가 CATEGORY_COLORS 의 hex 와 일치", () => {
  // 새 카테고리 추가 시 brand color 가 white bg 위 contrast 미달이면
  // BRAND_COLOR_ON_WHITE_VARIANT 에 추가해야 하는데, 오타·옛 hex 잔존 시 분기
  // 안 됨. test 가 fail-fast.
  it.each(Object.keys(BRAND_COLOR_ON_WHITE_VARIANT))(
    "variant key '%s' 가 CATEGORY_COLORS 의 어느 카테고리 색과 일치",
    (variantKey) => {
      const allBrandHex = Object.values(CATEGORY_COLORS);
      expect(allBrandHex).toContain(variantKey);
    },
  );

  it("variant keys 가 모두 white bg 위 contrast < 3:1 인 색만 (분기 의미)", () => {
    // 충분히 어두운 brand color (학생·교육 #0F766E 등) 가 variant 에 잘못 들어가면
    // 같은 색 분기로 의미 없음. 미달 색만 와야 함.
    for (const key of Object.keys(BRAND_COLOR_ON_WHITE_VARIANT)) {
      const c = contrast(key, "#FFFFFF");
      expect(c).toBeLessThan(3.0);
    }
  });
});
