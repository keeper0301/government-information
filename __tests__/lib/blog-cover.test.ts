// ============================================================
// blog-cover 그라디언트 단위 테스트
// ============================================================
// 목표:
//   1) getCategoryGradient.from 이 lib/instagram/card-colors 와 자동 동기화
//   2) 8 카테고리 모두 (문화 포함) from·to 정의 + valid hex
//   3) unknown / null → DEFAULT_GRADIENT fallback
//   4) getCategoryGradientCss 가 linear-gradient(135deg, ...) 형식
//
// 2026-05-16 contrast 도메인 마감 후속 — Dead code 2 경로 anti-pattern
// 차단 (옛 #18A5A5·#03B26C·#6B7684 잔존 0).
// ============================================================

import { describe, it, expect } from "vitest";
import {
  getCategoryGradient,
  getCategoryGradientCss,
  CATEGORY_GRADIENT_TO,
} from "@/lib/blog-cover";
import { CATEGORY_COLORS } from "@/lib/instagram/card-colors";

const EXPECTED_CATEGORIES = [
  "청년",
  "소상공인",
  "주거",
  "육아·가족",
  "노년",
  "학생·교육",
  "문화", // 2026-05-16 신규 추가 (이전 표 누락)
  "큐레이션",
];

// ── from 자동 동기화 (lib/instagram/card-colors 단일 source) ────
describe("getCategoryGradient.from === CATEGORY_COLORS[category]", () => {
  it.each(EXPECTED_CATEGORIES)(
    "'%s' 의 from 이 인스타 카드 brand color 와 일치",
    (cat) => {
      const g = getCategoryGradient(cat);
      expect(g.from).toBe(CATEGORY_COLORS[cat]);
    },
  );
});

// ── 8 카테고리 모두 to 정의 ─────────────────────────────────
describe("8 카테고리 그라디언트 to 정의", () => {
  it.each(EXPECTED_CATEGORIES)("'%s' 의 to 가 #RRGGBB 형식", (cat) => {
    const g = getCategoryGradient(cat);
    expect(g.to).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("문화 카테고리 그라디언트 정의 (2026-05-16 신규)", () => {
    const g = getCategoryGradient("문화");
    expect(g.from).toBe("#EAB308");
    expect(g.to).toBe("#B45309");
    expect(g.label).toBe("문화");
  });

  it("from 이 to 와 다른 색 (그라디언트 의미)", () => {
    for (const cat of EXPECTED_CATEGORIES) {
      const g = getCategoryGradient(cat);
      expect(g.from).not.toBe(g.to);
    }
  });
});

// ── 옛 hex 잔존 검출 ────────────────────────────────────────
describe("옛 hex 잔존 0 (2026-05-16 인스타 카드 contrast fix 와 동기화)", () => {
  it("학생·교육 from 이 옛 #18A5A5 X (새 #0F766E)", () => {
    const g = getCategoryGradient("학생·교육");
    expect(g.from).toBe("#0F766E");
    expect(g.from).not.toBe("#18A5A5");
  });

  it("주거 from 이 옛 #03B26C X (새 #047857)", () => {
    const g = getCategoryGradient("주거");
    expect(g.from).toBe("#047857");
    expect(g.from).not.toBe("#03B26C");
  });

  it("큐레이션 from 이 옛 #6B7684 X (새 #1F2937)", () => {
    const g = getCategoryGradient("큐레이션");
    expect(g.from).toBe("#1F2937");
    expect(g.from).not.toBe("#6B7684");
  });
});

// ── fallback ────────────────────────────────────────────────
describe("DEFAULT_GRADIENT fallback", () => {
  it("null → toss blue 그라디언트", () => {
    const g = getCategoryGradient(null);
    expect(g.from).toBe("#3182F6");
    expect(g.to).toBe("#1B64DA");
    expect(g.label).toBe("정책 블로그");
  });

  it("알려지지 않은 카테고리 → DEFAULT_GRADIENT", () => {
    const g = getCategoryGradient("이상한카테고리");
    expect(g.from).toBe("#3182F6");
    expect(g.label).toBe("정책 블로그");
  });

  it("빈 문자열 → DEFAULT_GRADIENT (falsy)", () => {
    const g = getCategoryGradient("");
    expect(g.label).toBe("정책 블로그");
  });
});

// ── invariant: CATEGORY_GRADIENT_TO keys ⟷ CATEGORY_COLORS keys ─
describe("CATEGORY_GRADIENT_TO keys 가 CATEGORY_COLORS keys 와 일치", () => {
  // 새 카테고리 추가 시 CATEGORY_COLORS 에만 추가하고 CATEGORY_GRADIENT_TO 누락 시
  // 그라디언트가 DEFAULT_GRADIENT (toss blue) 로 fallback — 시각 사고.
  // test 가 fail-fast 차단.
  it("두 표의 keys 가 동일 집합", () => {
    const colorKeys = Object.keys(CATEGORY_COLORS).sort();
    const gradientKeys = Object.keys(CATEGORY_GRADIENT_TO).sort();
    expect(gradientKeys).toEqual(colorKeys);
  });

  it.each(Object.keys(CATEGORY_COLORS))(
    "'%s' 카테고리가 CATEGORY_GRADIENT_TO 에도 정의",
    (cat) => {
      expect(CATEGORY_GRADIENT_TO[cat]).toBeDefined();
      expect(CATEGORY_GRADIENT_TO[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    },
  );
});

// ── getCategoryGradientCss ─────────────────────────────────
describe("getCategoryGradientCss (CSS linear-gradient 문자열)", () => {
  it("청년 → 'linear-gradient(135deg, #3182F6 0%, #1B64DA 100%)'", () => {
    expect(getCategoryGradientCss("청년")).toBe(
      "linear-gradient(135deg, #3182F6 0%, #1B64DA 100%)",
    );
  });

  it("문화 → 'linear-gradient(135deg, #EAB308 0%, #B45309 100%)' (신규)", () => {
    expect(getCategoryGradientCss("문화")).toBe(
      "linear-gradient(135deg, #EAB308 0%, #B45309 100%)",
    );
  });

  it("null → DEFAULT 그라디언트 CSS", () => {
    expect(getCategoryGradientCss(null)).toBe(
      "linear-gradient(135deg, #3182F6 0%, #1B64DA 100%)",
    );
  });
});
