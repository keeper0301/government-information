// ============================================================
// cleanPolicyTitle — 정책명 title 정제 (네이버 CTR 개선) 단위 테스트
// ============================================================
// 끝 괄호: 기관명 제거 / 행정구역 앞으로 / 중간 괄호 유지. 정규식 silent 회귀 방어.

import { describe, it, expect } from "vitest";
import { cleanPolicyTitle } from "@/lib/policy-title";

describe("cleanPolicyTitle", () => {
  it("기관명 끝 괄호 제거", () => {
    expect(cleanPolicyTitle("햇살론 플러스 (부산신용보증재단)")).toBe("햇살론 플러스");
    expect(cleanPolicyTitle("소상공인 정책자금 (중소벤처기업진흥공단)")).toBe(
      "소상공인 정책자금",
    );
  });

  it("행정구역(지역) 끝 괄호 → 가장 구체적 구역명을 앞으로", () => {
    expect(cleanPolicyTitle("출산지원금 지급 (부산광역시 사하구)")).toBe(
      "사하구 출산지원금 지급",
    );
    expect(cleanPolicyTitle("기초연금 (서울특별시 강남구)")).toBe("강남구 기초연금");
    expect(cleanPolicyTitle("전세자금대출 (경기도)")).toBe("경기도 전세자금대출");
  });

  it("정책 종류 중간 괄호는 유지(끝 괄호만 처리)", () => {
    expect(cleanPolicyTitle("생활안정자금 융자(자녀양육비) (근로복지공단)")).toBe(
      "생활안정자금 융자(자녀양육비)",
    );
  });

  it("끝 괄호 없으면 원본 유지", () => {
    expect(cleanPolicyTitle("청년 월세 한시 특별지원")).toBe("청년 월세 한시 특별지원");
  });

  it("괄호가 제목 전부면 원본 유지(안전)", () => {
    expect(cleanPolicyTitle("(전액지원)")).toBe("(전액지원)");
  });

  // 코드리뷰 P1 회귀 방어 — 기관·지역 아닌 끝 괄호는 절대 제거하지 않음.
  it("대상·연도·세부명 끝 괄호는 원본 유지(정보 손실·중복 title 방지)", () => {
    expect(cleanPolicyTitle("장애인복지 (중복지원)")).toBe("장애인복지 (중복지원)");
    expect(cleanPolicyTitle("청년월세 (만19세~34세)")).toBe("청년월세 (만19세~34세)");
    expect(cleanPolicyTitle("소상공인 지원 (24년)")).toBe("소상공인 지원 (24년)");
  });

  it("지역명이 base 앞에 이미 있으면 중복 안 붙임", () => {
    expect(cleanPolicyTitle("강남구 청년지원 (강남구)")).toBe("강남구 청년지원");
  });

  it("센터는 기관 아닌 정책명일 수 있어 원본 유지", () => {
    expect(cleanPolicyTitle("행복지원 (행복주민센터)")).toBe("행복지원 (행복주민센터)");
    expect(cleanPolicyTitle("치매안심센터 운영")).toBe("치매안심센터 운영");
  });

  it("빈 문자열·공백 안전", () => {
    expect(cleanPolicyTitle("")).toBe("");
    expect(cleanPolicyTitle("   ")).toBe("");
  });
});
