// reorderByTaxonomy 단위 테스트 — 카테고리 칩 정렬·정제 회귀 방어 (2026-06-06)
import { describe, it, expect } from "vitest";
import { reorderByTaxonomy } from "@/lib/category-counts";

describe("reorderByTaxonomy", () => {
  it("BENEFIT_TAGS 순서를 우선해 정렬", () => {
    const out = reorderByTaxonomy([
      { category: "의료", n: 5 },
      { category: "주거", n: 3 },
    ]);
    // 주거가 의료보다 BENEFIT_TAGS 에서 앞
    expect(out.map((r) => r.category)).toEqual(["주거", "의료"]);
  });

  it("영어 raw 카테고리('welfare')는 칩에서 제외 (분류 실패 noise)", () => {
    const out = reorderByTaxonomy([
      { category: "주거", n: 3 },
      { category: "welfare", n: 5 },
    ]);
    expect(out.find((r) => r.category === "welfare")).toBeUndefined();
    expect(out.map((r) => r.category)).toEqual(["주거"]);
  });

  it("한글 비표준 카테고리(정부 원분류 '수질')는 유지", () => {
    const out = reorderByTaxonomy([
      { category: "주거", n: 3 },
      { category: "수질", n: 154 },
    ]);
    expect(out.map((r) => r.category)).toEqual(["주거", "수질"]);
  });

  it("혼재: 한글(표준+비표준)은 유지하고 영어만 제외", () => {
    const out = reorderByTaxonomy([
      { category: "welfare", n: 5 },
      { category: "수질", n: 154 },
      { category: "주거", n: 3 },
    ]);
    expect(out.map((r) => r.category)).toEqual(["주거", "수질"]);
  });
});
