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

  it("cleans ready-candidate title samples that still sound cheap", () => {
    expect(
      sanitizeInstagramPolicyTitle("2026년 창업 아이디어 지원, 모두의 창업 프로젝트 마감 임박!"),
    ).toBe("2026년 창업 아이디어 지원, 모두의 창업 프로젝트 신청 기간 확인");
    expect(
      sanitizeInstagramPolicyTitle("2026년 서울시 장애인 가족 긴급돌봄, 놓치지 마세요!"),
    ).toBe("2026년 서울시 장애인 가족 긴급돌봄, 신청 전 확인");
    expect(
      sanitizeInstagramPolicyTitle("2026년 경북 우수 청년기업, 스케일업 최대 지원 받으세요!"),
    ).toBe("2026년 경북 우수 청년기업, 스케일업 지원 내용 확인");
    expect(
      sanitizeInstagramPolicyTitle("2026 경북 디지털전환 지원, 지역 특화 중소기업 놓치면 안 될 기회!"),
    ).toBe("2026 경북 디지털전환 지원, 지역 특화 중소기업 지원 내용 확인");
    expect(
      sanitizeInstagramPolicyTitle("2026년 동해시 수소 R&D 지원사업, 기업당 최대 얼마까지?"),
    ).toBe("2026년 동해시 수소 R&D 지원사업, 기업당 지원 한도 확인");
  });

  it("cleans description phrases without losing policy meaning", () => {
    expect(
      sanitizeInstagramPolicyDescription(
        "마감부터 봐야 해요. 바로가기 👇👇 핵심만 보기 좋게 정리했습니다.",
      ),
    ).toBe("신청 기간을 먼저 확인하세요. 공식 신청처 확인 대상·기간·서류를 정리했습니다.");
  });
});
