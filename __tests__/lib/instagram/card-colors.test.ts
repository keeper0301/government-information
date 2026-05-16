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
  getCategoryColor,
  isLightBg,
  categoryTextColor,
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
