import { describe, expect, it } from "vitest";
import { resolveInstagramCardHook } from "@/lib/instagram/card-hook";

describe("resolveInstagramCardHook", () => {
  it("uses money hook for amount-driven policies", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 과천시 초등 입학축하금 10만원",
        category: "육아·가족",
      }),
    ).toEqual({ type: "money_deadline", label: "대상·금액·기간 한 장 정리" });
  });

  it("uses official route hook for consulting and policy fund posts", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 인천 블록체인 도입 컨설팅 중소기업 지원",
        category: "소상공인",
      }),
    ).toEqual({ type: "official_route", label: "공식 신청처만 먼저 확인" });
  });

  it("falls back to checklist hook without fear copy", () => {
    expect(
      resolveInstagramCardHook({
        title: "2026년 시민 참여 프로그램 신청 안내",
        category: "정책",
      }),
    ).toEqual({ type: "checklist_default", label: "신청 전 이 3가지만 확인" });
  });
});
