// ============================================================
// 인스타 카드 텍스트 처리 단위 테스트 — 사장님 가르침 v1~v10 회귀 방지
// ============================================================
// preserveSemanticChunks · tokenizeSemantic · splitSentences 3 pure function.
// 5/16 카드 가독성 마감 후 회귀 안전망.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  preserveSemanticChunks,
  tokenizeSemantic,
  splitSentences,
} from "@/lib/instagram/card-text";

// ── preserveSemanticChunks (v7) ──────────────────────────────────
describe("preserveSemanticChunks (만/억 + 원 사이 공백 통일)", () => {
  it("'20만 원' → '20만원' (만 다음 공백)", () => {
    expect(preserveSemanticChunks("월 20만 원의 월세")).toBe("월 20만원의 월세");
  });

  it("'20 만 원' → '20만원' (양쪽 공백)", () => {
    expect(preserveSemanticChunks("월 20 만 원의 월세")).toBe("월 20만원의 월세");
  });

  it("'20 만원' → '20만원' (앞 공백만)", () => {
    expect(preserveSemanticChunks("월 20 만원의 월세")).toBe("월 20만원의 월세");
  });

  it("'20만원' 그대로 (공백 없음)", () => {
    expect(preserveSemanticChunks("월 20만원의 월세")).toBe("월 20만원의 월세");
  });

  it("'5억 원' → '5억원'", () => {
    expect(preserveSemanticChunks("총 5억 원 지원")).toBe("총 5억원 지원");
  });

  it("소수 (1.5만 원) 도 처리", () => {
    expect(preserveSemanticChunks("월 1.5만 원")).toBe("월 1.5만원");
  });
});

// ── tokenizeSemantic (v7 + v9) ────────────────────────────────────
describe("tokenizeSemantic (atomic chunk + orphan 결합)", () => {
  it("강조 부사 + 숫자 → 한 chunk ('최대 300만원')", () => {
    // 마지막 "지원" 은 orphan 결합 → "최대 300만원을 지원" (한 chunk)
    const tokens = tokenizeSemantic("청주시 빈집 철거 사업으로 최대 300만원을 지원");
    expect(tokens).toContain("최대 300만원을 지원");
    expect(tokens.includes("최대")).toBe(false);
  });

  it("여러 부사+숫자 chunk 동시 ('월 20만원', '최대 24개월')", () => {
    const tokens = tokenizeSemantic("최대 24개월 동안 월 20만원의 월세");
    expect(tokens).toContain("최대 24개월");
    // 마지막 "월세" 는 orphan 결합 → "월 20만원의 월세"
    expect(tokens).toContain("월 20만원의 월세");
  });

  it("v9 orphan — 마지막 3 글자 이하 → 이전과 합침 ('받는 방법')", () => {
    const tokens = tokenizeSemantic("월 20만원 받는 방법");
    expect(tokens[tokens.length - 1]).toBe("받는 방법");
  });

  it("v9 orphan — '주목!' (3 char) 결합 발동 → '농부 주목!'", () => {
    // "주목!" length 3 (한글 2 + ! 1) → orphan 결합 임계 통과
    const tokens = tokenizeSemantic("울산 중구 청년 농부 주목!");
    expect(tokens[tokens.length - 1]).toBe("농부 주목!");
  });

  it("v9 orphan — 4 글자 이상 → 결합 안 함 ('마세요!')", () => {
    // "마세요!" length 4 (한글 3 + ! 1) → 결합 임계 초과
    const tokens = tokenizeSemantic("부산 북구 출산장려금 놓치지 마세요!");
    expect(tokens[tokens.length - 1]).toBe("마세요!");
  });

  it("v9 orphan — 마지막이 숫자 시작 → 결합 안 함 (chunk 무결성)", () => {
    const tokens = tokenizeSemantic("청년 100");
    expect(tokens).toEqual(["청년", "100"]);
  });

  it("부사 룰 — '3월 30일' 의 '월 30' 매칭 X (어절 시작 위치만)", () => {
    const tokens = tokenizeSemantic("신청 3월 30일부터");
    // "3월" 다음 "30일부터" — "월" 이 어절 끝이라 매칭 안 됨
    expect(tokens).toContain("3월");
    expect(tokens).toContain("30일부터");
    expect(tokens.find((t) => t.includes("3월 30"))).toBeUndefined();
  });

  it("단일 token (orphan 결합 미적용)", () => {
    expect(tokenizeSemantic("청년")).toEqual(["청년"]);
  });

  it("빈 문자열", () => {
    expect(tokenizeSemantic("")).toEqual([]);
  });
});

// ── splitSentences (v1) ───────────────────────────────────────────
describe("splitSentences (마침표 기준 문장 split + max cap)", () => {
  it("한국어 종결 '~다.' + 공백 split — 종결 룰 delimiter 가 . 포함 → 첫 문장 . 제거", () => {
    // 종결형 룰 (?<=[다요까])\.[ \t]+ 의 \. 가 delimiter 일부 → 첫 split 시 "." 사라짐.
    // 마지막 문장은 split delimiter 없어서 "." 유지.
    const result = splitSentences("첫 문장입니다. 두번째 문장입니다.", 3);
    expect(result).toEqual(["첫 문장입니다", "두번째 문장입니다."]);
  });

  it("'~요.' + 영어 '?!' 모두 cover (각 룰 동작)", () => {
    // "요." 는 종결 룰 (delimiter 에 . 포함) → "안녕하세요" (. 사라짐)
    // "요?" 는 영어 룰 (lookbehind) → "도와드릴까요?" (? 유지)
    // 마지막 "좋아요!" 는 split 없음 (! 유지)
    const result = splitSentences("안녕하세요. 도와드릴까요? 좋아요!", 3);
    expect(result).toEqual(["안녕하세요", "도와드릴까요?", "좋아요!"]);
  });

  it("max cap — 4 문장 입력해도 3 문장만 반환", () => {
    const result = splitSentences("문장1. 문장2. 문장3. 문장4.", 3);
    expect(result).toHaveLength(3);
  });

  it("split 안 되는 단일 문장 → 1 element 배열", () => {
    expect(splitSentences("그냥 문장", 3)).toEqual(["그냥 문장"]);
  });

  it("trailing 공백 trim", () => {
    expect(splitSentences("  공백 있음  ", 3)).toEqual(["공백 있음"]);
  });

  it("빈 문자열 → 빈 element 한 개 (fallback)", () => {
    expect(splitSentences("", 3)).toEqual([""]);
  });
});
