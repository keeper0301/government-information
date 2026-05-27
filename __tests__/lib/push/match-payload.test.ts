// ============================================================
// match-payload pure 함수 unit test
// ============================================================
// DB 호출 부분은 integration test 영역. pure 함수 (truncate / sort /
// programToPayload) 만 검증 — 회귀 가드.
// ============================================================

import { describe, it, expect } from "vitest";
import { _internals } from "@/lib/push/match-payload";
import type { MatchedProgram } from "@/lib/alerts/matching";

const { truncateTitle, comparePrograms, programToPayload } = _internals;

function makeProgram(
  overrides: Partial<MatchedProgram> = {},
): MatchedProgram {
  return {
    id: "id-1",
    title: "샘플 정책",
    source: "test",
    apply_url: null,
    apply_end: null,
    published_at: "2026-05-27T00:00:00Z",
    description: null,
    household_target_tags: null,
    district: null,
    table: "welfare_programs",
    ...overrides,
  };
}

describe("match-payload pure 함수", () => {
  describe("truncateTitle", () => {
    it("80자 이하는 그대로", () => {
      const s = "짧은 제목";
      expect(truncateTitle(s)).toBe(s);
    });

    it("80자 초과는 77자 + '...' 형식", () => {
      const s = "가".repeat(100);
      const result = truncateTitle(s);
      expect(result.length).toBe(80);
      expect(result.endsWith("...")).toBe(true);
    });

    it("정확히 80자는 그대로 (boundary)", () => {
      const s = "ㄱ".repeat(80);
      expect(truncateTitle(s)).toBe(s);
    });
  });

  describe("comparePrograms — published_at DESC + NULL 뒤로", () => {
    it("최신 published 가 앞", () => {
      const old = makeProgram({ id: "a", published_at: "2026-05-20T00:00:00Z" });
      const recent = makeProgram({ id: "b", published_at: "2026-05-25T00:00:00Z" });
      const sorted = [old, recent].sort(comparePrograms);
      expect(sorted[0].id).toBe("b");
      expect(sorted[1].id).toBe("a");
    });

    it("NULL published_at 은 항상 뒤로", () => {
      const withDate = makeProgram({ id: "a", published_at: "2026-05-20T00:00:00Z" });
      const nullDate = makeProgram({ id: "b", published_at: null });
      const sorted = [nullDate, withDate].sort(comparePrograms);
      expect(sorted[0].id).toBe("a");
      expect(sorted[1].id).toBe("b");
    });

    it("동일 published_at 은 안정 (0 반환)", () => {
      const a = makeProgram({ id: "a", published_at: "2026-05-20T00:00:00Z" });
      const b = makeProgram({ id: "b", published_at: "2026-05-20T00:00:00Z" });
      expect(comparePrograms(a, b)).toBe(0);
    });
  });

  describe("programToPayload — welfare/loan 분기 + title 형식", () => {
    it("welfare → '복지' label + /welfare/{id} url", () => {
      const p = makeProgram({
        id: "abc",
        title: "청년월세 지원",
        table: "welfare_programs",
      });
      const payload = programToPayload(p);
      expect(payload.title).toContain("복지");
      expect(payload.body).toBe("청년월세 지원");
      expect(payload.url).toBe("/welfare/abc");
      expect(payload.tag).toBe("keepioo-welfare-abc");
    });

    it("loan → '대출' label + /loan/{id} url", () => {
      const p = makeProgram({
        id: "xyz",
        title: "소상공인 정책자금",
        table: "loan_programs",
      });
      const payload = programToPayload(p);
      expect(payload.title).toContain("대출");
      expect(payload.url).toBe("/loan/xyz");
      expect(payload.tag).toBe("keepioo-loan-xyz");
    });

    it("긴 title 자동 truncate", () => {
      const longTitle = "가".repeat(120);
      const p = makeProgram({ title: longTitle });
      const payload = programToPayload(p);
      expect(payload.body.length).toBe(80);
      expect(payload.body.endsWith("...")).toBe(true);
    });
  });
});
