import { describe, expect, it } from "vitest";
import { sanitizeAlertKeyword } from "@/lib/alerts/matching";

// 2026-06-05 코드리뷰 P1 회귀 방어 — 사용자 알림 keyword 가 PostgREST .or() 필터에
// escape 없이 보간되던 인젝션 fix. 쉼표·괄호·% 가 필터 문법을 깨면 그 테이블 매칭이
// 통째 실패해 알림이 silent 누락된다. (입력창 placeholder 가 "전기차, 창업자금"
// 처럼 쉼표를 유도해 흔히 발생.) sanitize 가 메타문자를 제거하는지 검증한다.
describe("sanitizeAlertKeyword — PostgREST .or() 메타문자 제거", () => {
  it("일반 키워드는 그대로 보존한다", () => {
    expect(sanitizeAlertKeyword("청년")).toBe("청년");
    expect(sanitizeAlertKeyword("창업 지원금")).toBe("창업 지원금");
  });

  it("쉼표를 제거하고 공백으로 정규화한다 (placeholder 쉼표 유도 케이스)", () => {
    expect(sanitizeAlertKeyword("전기차, 창업자금")).toBe("전기차 창업자금");
  });

  it("괄호를 제거한다", () => {
    expect(sanitizeAlertKeyword("창업(자금)")).toBe("창업 자금");
  });

  it("ILIKE 와일드카드 % 를 제거한다", () => {
    expect(sanitizeAlertKeyword("지원금50%")).toBe("지원금50");
  });

  it("복합 메타문자를 모두 제거하고 공백 1개로 합친다", () => {
    // review 권고 케이스 — 쉼표·괄호·% 동시
    expect(sanitizeAlertKeyword("전기차, 창업(자금)%")).toBe("전기차 창업 자금");
  });

  it("앞뒤 공백을 trim 한다", () => {
    expect(sanitizeAlertKeyword("  청년  ")).toBe("청년");
  });

  it("메타문자만 있으면 빈 문자열 — 호출처의 length>=2 가드가 전체매칭(.or %%)을 막는다", () => {
    expect(sanitizeAlertKeyword("(),%")).toBe("");
    // 빈 문자열은 length<2 라 matching.ts 에서 .or() 자체를 skip → title.ilike.%% 사고 없음
    expect(sanitizeAlertKeyword("(),%").length < 2).toBe(true);
  });

  it("점(.)은 보존한다 — PostgREST .or() value 내부 점은 안전(구분자 아님)", () => {
    expect(sanitizeAlertKeyword("3.5억")).toBe("3.5억");
  });
});
