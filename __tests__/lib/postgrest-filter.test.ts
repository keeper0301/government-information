import { describe, expect, it } from "vitest";
import { escapeOrFilterValue, tokenizeForOrFilter } from "@/lib/postgrest-filter";

// 2026-06-05 코드리뷰 — PostgREST .or() 필터에 사용자 검색어를 escape 없이 보간하던
// 인젝션/필터붕괴 방지. 쉼표·괄호·점(.or 구조 메타문자) 제거 + ILIKE 와일드카드 escape.

describe("escapeOrFilterValue — 단일 값 안전화", () => {
  it("일반 검색어는 그대로 보존한다", () => {
    expect(escapeOrFilterValue("청년 주거")).toBe("청년 주거");
  });

  it("쉼표·괄호·점을 제거한다 (필터 인젝션·구조붕괴 차단)", () => {
    // 콤마/점으로 임의 조건 주입 시도 → 분해돼 무력화 (_ 는 ILIKE 라 escape 됨)
    expect(escapeOrFilterValue("view_count.gte.0,title")).toBe(
      "view\\_count gte 0 title",
    );
    expect(escapeOrFilterValue("창업(자금)")).toBe("창업 자금");
  });

  it("ILIKE 와일드카드 % _ \\ 를 escape 한다", () => {
    expect(escapeOrFilterValue("50%")).toBe("50\\%");
    expect(escapeOrFilterValue("a_b")).toBe("a\\_b");
  });

  it("메타문자만 있으면 빈 문자열", () => {
    expect(escapeOrFilterValue("(),.")).toBe("");
  });
});

describe("tokenizeForOrFilter — 토큰 배열", () => {
  it("공백으로 토큰을 분리한다", () => {
    expect(tokenizeForOrFilter("청년 주거 지원")).toEqual([
      "청년",
      "주거",
      "지원",
    ]);
  });

  it("인젝션 시도가 메타문자 제거로 평범한 토큰이 된다", () => {
    // 콤마·점 분해로 임의 조건 주입 무력화 (_ 는 ILIKE escape)
    expect(tokenizeForOrFilter("a,view_count.gte.0")).toEqual([
      "a",
      "view\\_count",
      "gte",
      "0",
    ]);
  });

  it("빈 입력·메타문자만 → 빈 배열", () => {
    expect(tokenizeForOrFilter("")).toEqual([]);
    expect(tokenizeForOrFilter("()")).toEqual([]);
  });
});
