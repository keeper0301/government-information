import { describe, expect, it } from "vitest";
import { resolveInstagramCardHook } from "@/lib/instagram/card-hook";

describe("resolveInstagramCardHook", () => {
  it("uses money hook for amount-driven policies", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 과천시 초등 입학축하금 10만원",
        category: "육아·가족",
      }),
    ).toEqual({ type: "money_deadline", label: "저장 포인트 · 대상 · 금액 · 신청기간" });
  });

  it("uses housing condition hook before generic official-route hooks", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 서울 청년 전월세보증금 지원",
        category: "주거",
      }),
    ).toEqual({ type: "housing_condition", label: "저장 포인트 · 대상 조건 · 주거비 · 기간" });
  });

  it("uses official route hook for consulting and policy fund posts", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 인천 블록체인 도입 컨설팅 중소기업 지원",
        category: "소상공인",
      }),
    ).toEqual({ type: "official_route", label: "저장 포인트 · 대상 · 서류 · 공식 신청처" });
  });

  it("uses share hook for youth/student posts without amount signal", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 청년 멘토링 참여자 모집",
        category: "청년",
      }),
    ).toEqual({ type: "share_age", label: "공유 포인트 · 대상 나이 · 기간 · 신청처" });
  });

  it("falls back to checklist hook without fear copy", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 시민 참여 프로그램 신청 안내",
        category: "정책",
      }),
    ).toEqual({ type: "checklist_default", label: "저장 포인트 · 대상 · 기간 · 공식 신청처" });
  });
});
