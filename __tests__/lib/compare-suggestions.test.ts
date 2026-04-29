// __tests__/lib/compare-suggestions.test.ts
// ============================================================
// buildSuggestions — /compare 자동 페어 추천 회귀 방지 테스트
// ============================================================
// 빈 입력 / 단일 그룹 / 다중 그룹 / type 분리 / category null 제외
// 5 case 검증.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  type SuggestionInput,
} from "@/lib/compare-suggestions";

describe("buildSuggestions", () => {
  it("빈 배열 → 빈 페어", () => {
    expect(buildSuggestions([])).toEqual([]);
  });

  it("단일 카테고리 ≥ 2건 → 1 페어", () => {
    const items: SuggestionInput[] = [
      { id: "a", type: "welfare", title: "A", category: "청년" },
      { id: "b", type: "welfare", title: "B", category: "청년" },
    ];
    const out = buildSuggestions(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("welfare");
    expect(out[0].category).toBe("청년");
    expect(out[0].ids).toEqual(["a", "b"]);
    expect(out[0].reason).toContain("청년");
    expect(out[0].reason).toContain("2건");
  });

  it("다중 카테고리 (각 ≥ 2건) → 여러 페어, 큰 그룹 우선", () => {
    const items: SuggestionInput[] = [
      // 청년 3건
      { id: "y1", type: "welfare", title: "Y1", category: "청년" },
      { id: "y2", type: "welfare", title: "Y2", category: "청년" },
      { id: "y3", type: "welfare", title: "Y3", category: "청년" },
      // 노인 2건
      { id: "s1", type: "welfare", title: "S1", category: "노인" },
      { id: "s2", type: "welfare", title: "S2", category: "노인" },
    ];
    const out = buildSuggestions(items);
    expect(out).toHaveLength(2);
    // 큰 그룹 (청년 3건) 이 먼저
    expect(out[0].category).toBe("청년");
    expect(out[0].ids).toHaveLength(3);
    expect(out[1].category).toBe("노인");
    expect(out[1].ids).toHaveLength(2);
  });

  it("type 다른 같은 카테고리 → 별도 페어 (welfare 청년 vs loan 청년)", () => {
    const items: SuggestionInput[] = [
      { id: "w1", type: "welfare", title: "W1", category: "청년" },
      { id: "w2", type: "welfare", title: "W2", category: "청년" },
      { id: "l1", type: "loan", title: "L1", category: "청년" },
      { id: "l2", type: "loan", title: "L2", category: "청년" },
    ];
    const out = buildSuggestions(items);
    expect(out).toHaveLength(2);
    const types = out.map((p) => p.type).sort();
    expect(types).toEqual(["loan", "welfare"]);
    // 두 페어 모두 카테고리 "청년"
    for (const pair of out) {
      expect(pair.category).toBe("청년");
      expect(pair.ids).toHaveLength(2);
    }
  });

  it("category null/빈 문자열 인 row 는 페어 후보 제외", () => {
    const items: SuggestionInput[] = [
      { id: "n1", type: "welfare", title: "N1", category: null },
      { id: "n2", type: "welfare", title: "N2", category: null },
      { id: "e1", type: "welfare", title: "E1", category: "" },
      { id: "e2", type: "welfare", title: "E2", category: "" },
      { id: "y1", type: "welfare", title: "Y1", category: "청년" },
      { id: "y2", type: "welfare", title: "Y2", category: "청년" },
    ];
    const out = buildSuggestions(items);
    // 청년 1 페어만 남음 (null·"" 그룹은 제외)
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("청년");
  });
});
