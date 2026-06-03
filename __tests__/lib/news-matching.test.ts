// ============================================================
// news-matching 회귀 테스트 — 2026-06-03 (테스트 0이던 핵심 매칭 로직)
// ============================================================
// expandKeywords: 뉴스 키워드 → 공고 검색 토큰 매핑 회귀(오타·삭제 방어).
// sanitizeSearchTokens: ILIKE injection 방지(보안 회귀 방어 — .or() 체인 마지막 방어선).
// findRelatedPrograms 는 Supabase 의존이라 여기선 순수 함수 2개만 커버.
// ============================================================

import { describe, it, expect } from "vitest";
import { expandKeywords, sanitizeSearchTokens } from "@/lib/news-matching";

describe("expandKeywords (뉴스 키워드 → 공고 검색 토큰)", () => {
  it("동의어 확장 — 노인 → 노인·어르신·고령", () => {
    expect(expandKeywords(["노인"])).toEqual(
      expect.arrayContaining(["노인", "어르신", "고령"]),
    );
  });

  it("단일 매핑 — 청년 → 청년", () => {
    expect(expandKeywords(["청년"])).toEqual(["청년"]);
  });

  it("중복 토큰 제거 (Set)", () => {
    const out = expandKeywords(["노인", "노인"]);
    expect(out.filter((t) => t === "노인")).toHaveLength(1);
  });

  it("미매핑 macro 키워드는 skip (민생·추경 등)", () => {
    expect(expandKeywords(["민생", "추경"])).toEqual([]);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(expandKeywords([])).toEqual([]);
  });
});

describe("sanitizeSearchTokens (ILIKE injection 방지)", () => {
  it("위험 문자 %·_·\\·,·() 제거", () => {
    expect(sanitizeSearchTokens(["청년%_,()"])).toEqual(["청년"]);
  });

  it("20자 초과 토큰 제외", () => {
    expect(sanitizeSearchTokens(["a".repeat(21)])).toEqual([]);
  });

  it("정상 토큰은 그대로 통과", () => {
    expect(sanitizeSearchTokens(["청년", "소상공인"])).toEqual([
      "청년",
      "소상공인",
    ]);
  });

  it("제거 후 빈 문자열이 되는 토큰 제외", () => {
    expect(sanitizeSearchTokens(["%%%", "()"])).toEqual([]);
  });

  it("백슬래시 제거 (정규식 \\ 포함)", () => {
    expect(sanitizeSearchTokens(["청\\년"])).toEqual(["청년"]);
  });
});
