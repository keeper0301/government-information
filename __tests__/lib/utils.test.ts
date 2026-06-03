// ============================================================
// lib/utils 회귀 테스트 — 2026-06-03 (테스트 0이던 본문 정제·중복 묶음)
// ============================================================
// cleanDescription: 엔티티 디코드·태그→줄바꿈·라벨 개행·idempotent (정책/뉴스 본문 전역).
// isSubstantiallyDuplicate: 핵심정보 카드 vs 본문 중복 숨김 판정(임계값 회귀 방어).
// stripCardDuplicates: 카드에 이미 있는 "라벨: 값" 블록만 제거(자유 텍스트 보존).
// isOutdatedByTitle: 옛 공고 연도 게이트(정규식 오탐 회귀 방어 — collector 차단선).
// ============================================================

import { describe, it, expect } from "vitest";
import {
  cleanDescription,
  isSubstantiallyDuplicate,
  stripCardDuplicates,
  isOutdatedByTitle,
} from "@/lib/utils";

describe("cleanDescription (본문 정제)", () => {
  it("null/undefined/빈 문자열 → 빈 문자열 (안전 기본값)", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription(undefined)).toBe("");
    expect(cleanDescription("")).toBe("");
  });

  it("HTML 엔티티 디코드 — &amp; → &", () => {
    expect(cleanDescription("청년 A&amp;B 지원")).toBe("청년 A&B 지원");
  });

  it("이중 인코딩 엔티티까지 디코드 — &amp;nbsp; → 공백", () => {
    // &amp;nbsp; → (1회) &nbsp; → (2회) 공백. 결과는 공백 정리 후 한 칸.
    expect(cleanDescription("가나X&amp;nbsp;Y다라")).toBe("가나X Y다라");
  });

  it("<br> 태그 → 줄바꿈", () => {
    expect(cleanDescription("첫째 줄<br>둘째 줄")).toBe("첫째 줄\n둘째 줄");
  });

  it("섹션 구분자(▶) 앞에 빈 줄 삽입", () => {
    expect(cleanDescription("안내▶지원대상")).toBe("안내\n\n▶ 지원대상");
  });

  it("문장 중간 라벨(지원대상:) 앞을 개행 — 맨 앞 라벨은 보존", () => {
    expect(cleanDescription("프로그램 안내 지원대상: 청년")).toBe(
      "프로그램 안내\n지원대상: 청년",
    );
  });

  it("<li> → 글머리표(•), </li> → 줄바꿈 (목록 가독성)", () => {
    expect(cleanDescription("<ul><li>항목1</li><li>항목2</li></ul>")).toBe(
      "• 항목1\n• 항목2",
    );
  });

  it("<p></p> → 빈 줄 (한 덩어리 렌더 사고 회귀선)", () => {
    expect(cleanDescription("<p>첫 문단</p><p>둘째 문단</p>")).toBe(
      "첫 문단\n\n둘째 문단",
    );
  });

  it("idempotent — 이미 정제된 텍스트를 다시 넣어도 동일", () => {
    const once = cleanDescription("가<br>나▶지원대상: 청년 A&amp;B");
    expect(cleanDescription(once)).toBe(once);
  });
});

describe("isSubstantiallyDuplicate (카드 vs 본문 중복 판정)", () => {
  it("한쪽이 비면 false (판정 불가)", () => {
    expect(isSubstantiallyDuplicate(null, "본문")).toBe(false);
    expect(isSubstantiallyDuplicate("값", undefined)).toBe(false);
  });

  it("정규화 후 완전 동일 → true (짧아도 동일이면 중복)", () => {
    expect(isSubstantiallyDuplicate("같은 내용", "같은  내용")).toBe(true);
  });

  it("짧은 값(<50자)은 부분일치로 판정하지 않음 → false", () => {
    expect(isSubstantiallyDuplicate("청년 지원", "노인 지원 안내문")).toBe(false);
  });

  it("길이 비슷 + 앞 100자 포함 → true (끝만 살짝 다른 케이스)", () => {
    const value = "가".repeat(60);
    const description = "가".repeat(60) + "나".repeat(20); // ratio 0.75, head 포함
    expect(isSubstantiallyDuplicate(value, description)).toBe(true);
  });

  it("길이 차이 큼(ratio<0.7) → false", () => {
    const value = "가".repeat(60);
    const description = "가".repeat(60) + "나".repeat(40); // ratio 0.6
    expect(isSubstantiallyDuplicate(value, description)).toBe(false);
  });
});

describe("stripCardDuplicates (카드 중복 라벨 블록 제거)", () => {
  it("null → 빈 문자열", () => {
    expect(stripCardDuplicates(null)).toBe("");
  });

  it("카드 라벨(지원대상:) 블록 제거 + 자유 텍스트 보존", () => {
    expect(
      stripCardDuplicates("지원대상: 청년\n\n자유롭게 적힌 설명 문단입니다"),
    ).toBe("자유롭게 적힌 설명 문단입니다");
  });

  it("카드에 없는 라벨(상세조건:) 블록은 보존, 있는 라벨만 제거", () => {
    expect(
      stripCardDuplicates("상세조건: 만 19세 이상\n\n지원대상: 청년"),
    ).toBe("상세조건: 만 19세 이상");
  });

  it("라벨 없는 블록만 있으면 원문 그대로 (안전)", () => {
    expect(stripCardDuplicates("일반 설명 한 줄")).toBe("일반 설명 한 줄");
  });

  it("\\n\\n 없이 단일 \\n 로 조립된 본문도 라벨 제거 (fallback 분기)", () => {
    expect(stripCardDuplicates("지원대상: 청년\n자유 설명")).toBe("자유 설명");
  });
});

describe("isOutdatedByTitle (옛 공고 연도 게이트)", () => {
  it("minYear 미만 연도 → true (옛 공고)", () => {
    expect(isOutdatedByTitle("2023년 지원계획", 2025)).toBe(true);
  });

  it("제목 중간 연도도 인식 — 'K-스타트업 2024' → true", () => {
    expect(isOutdatedByTitle("도전! K-스타트업 2024 공고", 2025)).toBe(true);
  });

  it("minYear 이상 연도 → false (유효)", () => {
    expect(isOutdatedByTitle("2025년 모집", 2025)).toBe(false);
  });

  it("연도 없음 → false (상시 가능성, 차단 안 함)", () => {
    expect(isOutdatedByTitle("상시 청년 지원", 2025)).toBe(false);
  });

  it("뒤 숫자 붙은 건 연도 아님 — '20241번' → false", () => {
    expect(isOutdatedByTitle("접수번호 20241번 안내", 2025)).toBe(false);
  });

  it("앞 숫자 붙은 건 연도 아님 — '12024' → false (정규식 대칭)", () => {
    expect(isOutdatedByTitle("코드 12024 안내", 2025)).toBe(false);
  });
});
