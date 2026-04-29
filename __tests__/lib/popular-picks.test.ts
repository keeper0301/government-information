// ============================================================
// __tests__/lib/popular-picks.test.ts — 인기 정책 TOP N 가중 점수 회귀 가드
// ============================================================
// 4 시그널 (view_count + deadlineBoost + freshnessBoost + category cap) 검증.
// 사후 reviewer 가 점수 가중 정확성을 확인할 수 있도록 모든 분기 cover.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  applyCategoryCap,
  calcScore,
  deadlineBoost,
  freshnessBoost,
  type ScorableRow,
} from "@/lib/popular-picks";

const TODAY = new Date("2026-04-29T00:00:00Z");

function makeRow(over: Partial<ScorableRow>): ScorableRow {
  return {
    id: "r1",
    title: "정책",
    view_count: 100,
    apply_end: null,
    created_at: "2026-04-01T00:00:00Z",
    benefit_tags: [],
    kind: "welfare",
    ...over,
  };
}

describe("deadlineBoost", () => {
  it("apply_end null → 1.0 (상시 모집)", () => {
    expect(deadlineBoost(null, TODAY)).toBe(1.0);
  });

  it("D-1 (마감 임박) → 1.5", () => {
    expect(deadlineBoost("2026-04-30T00:00:00Z", TODAY)).toBe(1.5);
  });

  it("D-7 경계 → 1.5", () => {
    expect(deadlineBoost("2026-05-06T00:00:00Z", TODAY)).toBe(1.5);
  });

  it("D-10 → 1.2", () => {
    expect(deadlineBoost("2026-05-09T00:00:00Z", TODAY)).toBe(1.2);
  });

  it("D-30 → 1.0 (boost 없음)", () => {
    expect(deadlineBoost("2026-05-29T00:00:00Z", TODAY)).toBe(1.0);
  });
});

describe("freshnessBoost", () => {
  it("3일 전 created → 1.3 (신규 boost)", () => {
    expect(freshnessBoost("2026-04-26T00:00:00Z", TODAY)).toBe(1.3);
  });

  it("10일 전 → 1.15", () => {
    expect(freshnessBoost("2026-04-19T00:00:00Z", TODAY)).toBe(1.15);
  });

  it("30일 전 → 1.0 (정체된 row, boost 없음)", () => {
    expect(freshnessBoost("2026-03-30T00:00:00Z", TODAY)).toBe(1.0);
  });
});

describe("calcScore — 가중 곱", () => {
  it("view_count 100 + 마감 임박 D-1 + 신규 3일 = 100 × 1.5 × 1.3 = 195", () => {
    const row = makeRow({
      view_count: 100,
      apply_end: "2026-04-30T00:00:00Z",
      created_at: "2026-04-26T00:00:00Z",
    });
    expect(calcScore(row, TODAY)).toBe(195);
  });

  it("view_count 0 → 0 (boost 곱해도 0)", () => {
    const row = makeRow({ view_count: 0, apply_end: "2026-04-30T00:00:00Z" });
    expect(calcScore(row, TODAY)).toBe(0);
  });

  it("상시 모집 + 오래된 row → view_count 그대로", () => {
    const row = makeRow({
      view_count: 50,
      apply_end: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(calcScore(row, TODAY)).toBe(50);
  });
});

describe("applyCategoryCap", () => {
  it("같은 카테고리 ≤ 2건 cap", () => {
    const rows: ScorableRow[] = [
      makeRow({ id: "1", benefit_tags: ["청년"] }),
      makeRow({ id: "2", benefit_tags: ["청년"] }),
      makeRow({ id: "3", benefit_tags: ["청년"] }), // cap 초과 → 제외 후보
      makeRow({ id: "4", benefit_tags: ["노년"] }),
      makeRow({ id: "5", benefit_tags: ["주거"] }),
    ];
    const result = applyCategoryCap(rows, 5);
    // 1·2 (청년 cap), 4 (노년), 5 (주거) 우선 + 부족분 채우기로 3 추가 = 4건이지만 5 limit 라 3 도 채움
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(["1", "2", "4", "5", "3"]);
  });

  it("benefit_tags 비어있으면 kind (welfare/loan) 를 카테고리로", () => {
    const rows: ScorableRow[] = [
      makeRow({ id: "1", benefit_tags: [], kind: "welfare" }),
      makeRow({ id: "2", benefit_tags: [], kind: "welfare" }),
      makeRow({ id: "3", benefit_tags: [], kind: "welfare" }), // welfare cap 초과
      makeRow({ id: "4", benefit_tags: [], kind: "loan" }),
    ];
    const result = applyCategoryCap(rows, 4);
    // 1·2 welfare cap, 4 loan, 부족분 3 추가
    expect(result.map((r) => r.id)).toEqual(["1", "2", "4", "3"]);
  });

  it("limit 3 → 정확 3건 반환 (cap 안 걸리면 그대로)", () => {
    const rows: ScorableRow[] = [
      makeRow({ id: "1", benefit_tags: ["청년"] }),
      makeRow({ id: "2", benefit_tags: ["노년"] }),
      makeRow({ id: "3", benefit_tags: ["주거"] }),
    ];
    expect(applyCategoryCap(rows, 3).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("빈 배열 → 빈 배열", () => {
    expect(applyCategoryCap([], 5)).toEqual([]);
  });
});
