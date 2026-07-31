import { describe, expect, it } from "vitest";
import { resolveInstagramCardHook } from "@/lib/instagram/card-hook";

describe("resolveInstagramCardHook", () => {
  it("uses money hook for amount-driven policies", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 과천시 초등 입학축하금 10만원",
        category: "육아·가족",
      }),
    ).toEqual({ type: "money_deadline", label: "저장/공유 · 금액보다 대상·마감 먼저" });
  });

  it("uses housing condition hook before generic official-route hooks", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 서울 청년 전월세보증금 지원",
        category: "주거",
      }),
    ).toEqual({ type: "housing_condition", label: "월세·전세 해당자에게 공유 · 조건 먼저" });
  });

  it("uses official route hook for consulting posts", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 인천 블록체인 도입 컨설팅 지원",
        category: "디지털",
      }),
    ).toEqual({ type: "official_route", label: "저장 · 공식 신청처 헷갈림 방지" });
  });

  it("uses small-business share hook for owner-facing policies", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 공주시 위기상권 소상공인 신용보증 지원",
        category: "소상공인",
      }),
    ).toEqual({ type: "small_business_share", label: "사장님에게 공유 · 대상·신청처 먼저" });
  });

  it("uses share hook for youth/student posts without amount signal", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 청년 멘토링 참여자 모집",
        category: "청년",
      }),
    ).toEqual({ type: "share_age", label: "청년·학생이면 공유 · 나이·기간 확인" });
  });

  it("uses document-focused hook when required documents are the save reason", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 가족돌봄 지원 신청 안내",
        description: "신청서와 증빙서류 제출 방법을 정리했습니다.",
        category: "육아·가족",
      }),
    ).toEqual({ type: "document_save", label: "저장 · 제출서류 빠뜨리면 다시 해야 함" });
  });

  it("falls back to checklist hook without fear copy", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 시민 참여 프로그램 안내",
        category: "정책",
      }),
    ).toEqual({ type: "checklist_default", label: "저장 · 대상/기간/신청처 30초 체크" });
  });

  it("does not emit weak generic save/share labels", () => {
    const samples = [
      resolveInstagramCardHook({ title: "2026년 과천시 초등 입학축하금 10만원", category: "육아·가족" }),
      resolveInstagramCardHook({ title: "2026년 서울 청년 전월세보증금 지원", category: "주거" }),
      resolveInstagramCardHook({ title: "2026년 공주시 위기상권 소상공인 신용보증 지원", category: "소상공인" }),
      resolveInstagramCardHook({ title: "2026년 시민 참여 프로그램 안내", category: "정책" }),
    ];

    for (const hook of samples) {
      expect(hook.label).not.toContain("저장 이유 ·");
      expect(hook.label).toMatch(/저장|공유|해당자|사장님/);
    }
  });
});
