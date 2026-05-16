// ============================================================
// CATEGORY_ORDER 동기화 invariant 검증
// ============================================================
// 새 카테고리 추가 시 lib/instagram/card-colors 의 CATEGORY_COLORS 와
// lib/instagram/category-preview 의 CATEGORY_ORDER 가 다르면 어드민
// 카테고리 검증 페이지에서 일부 카테고리 누락. test 가 fail-fast.
// ============================================================

import { describe, it, expect } from "vitest";
import { CATEGORY_COLORS } from "@/lib/instagram/card-colors";
import { CATEGORY_ORDER } from "@/lib/instagram/category-preview";

describe("CATEGORY_ORDER ⟷ CATEGORY_COLORS 동기화", () => {
  it("CATEGORY_COLORS 의 8 카테고리 모두 ORDER 에 포함", () => {
    const colorKeys = Object.keys(CATEGORY_COLORS).sort();
    const orderKeys = [...CATEGORY_ORDER].sort();
    expect(orderKeys).toEqual(colorKeys);
  });

  it("CATEGORY_ORDER 항목 수 = 8", () => {
    expect(CATEGORY_ORDER.length).toBe(8);
  });

  it("CATEGORY_ORDER 항목 모두 unique (중복 0)", () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });

  it.each(Array.from(CATEGORY_ORDER))(
    "'%s' 가 CATEGORY_COLORS 에 정의돼 있음",
    (cat) => {
      expect(CATEGORY_COLORS[cat]).toBeDefined();
    },
  );
});
