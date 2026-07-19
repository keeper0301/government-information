import { describe, expect, it } from "vitest";
import {
  sanitizeInstagramPolicyDescription,
  sanitizeInstagramPolicyTitle,
} from "@/lib/instagram/policy-copy";

describe("Instagram policy copy sanitizer", () => {
  it("turns fear/clickbait title phrases into policy-brand wording", () => {
    expect(
      sanitizeInstagramPolicyTitle(
        "2026년 인천 블록체인 도입 컨설팅 중소기업 성장 기회 놓치면 후회",
      ),
    ).toBe("2026년 인천 블록체인 도입 컨설팅 중소기업 지원 내용 확인");
  });

  it("cleans description phrases without losing policy meaning", () => {
    expect(
      sanitizeInstagramPolicyDescription(
        "마감부터 봐야 해요. 바로가기 👇👇 핵심만 보기 좋게 정리했습니다.",
      ),
    ).toBe("신청 기간을 먼저 확인하세요. 공식 신청처 확인 대상·기간·서류를 정리했습니다.");
  });
});
