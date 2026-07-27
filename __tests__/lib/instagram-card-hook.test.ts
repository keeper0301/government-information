import { describe, expect, it } from "vitest";
import { resolveInstagramCardHook } from "@/lib/instagram/card-hook";

describe("resolveInstagramCardHook", () => {
  it("uses money hook for amount-driven policies", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 과천시 초등 입학축하금 10만원",
        category: "육아·가족",
      }),
    ).toEqual({ type: "money_deadline", label: "저장 이유 · 금액 · 대상 · 신청 마감" });
  });

  it("uses housing condition hook before generic official-route hooks", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 서울 청년 전월세보증금 지원",
        category: "주거",
      }),
    ).toEqual({ type: "housing_condition", label: "공유 이유 · 주거비 · 대상 조건 · 신청처" });
  });

  it("uses official route hook for consulting and policy fund posts", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 인천 블록체인 도입 컨설팅 중소기업 지원",
        category: "소상공인",
      }),
    ).toEqual({ type: "official_route", label: "저장 이유 · 공식 신청처 · 서류 · 기간" });
  });

  it("uses share hook for youth/student posts without amount signal", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 청년 멘토링 참여자 모집",
        category: "청년",
      }),
    ).toEqual({ type: "share_age", label: "공유 이유 · 청년 대상 · 기간 · 신청처" });
  });

  it("uses document-focused hook when required documents are the save reason", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 가족돌봄 지원 신청 안내",
        description: "신청서와 증빙서류 제출 방법을 정리했습니다.",
        category: "육아·가족",
      }),
    ).toEqual({ type: "official_route", label: "저장 이유 · 준비서류 · 기간 · 신청처" });
  });

  it("falls back to checklist hook without fear copy", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 시민 참여 프로그램 신청 안내",
        category: "정책",
      }),
    ).toEqual({ type: "checklist_default", label: "저장 이유 · 대상 여부 · 기간 · 신청처" });
  });
});
