// ============================================================
// cleanPolicyTitle — 정책명 title 정제 (네이버 CTR 개선) 단위 테스트
// ============================================================
// 끝 괄호: 기관명 제거 / 행정구역 앞으로 / 중간 괄호 유지. 정규식 silent 회귀 방어.

import { describe, it, expect } from "vitest";
import { cleanPolicyTitle, buildSeoTitle } from "@/lib/policy-title";

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

describe("buildSeoTitle (연도 + 검색의도 키워드)", () => {
  const today = "2026-06-15";

  it("마감일이 미래면 연도를 앞에 붙인다", () => {
    expect(
      buildSeoTitle({ title: "청년 월세 지원", applyEnd: "2026-12-31", today, keyword: "신청자격·방법" }),
    ).toBe("2026년 청년 월세 지원 신청자격·방법 — 정책알리미");
  });

  it("마감일이 과거(만료)면 연도를 붙이지 않는다", () => {
    expect(
      buildSeoTitle({ title: "청년 월세 지원", applyEnd: "2025-12-31", today, keyword: "신청자격·방법" }),
    ).toBe("청년 월세 지원 신청자격·방법 — 정책알리미");
  });

  it("마감일이 없으면(상시) 연도를 붙이지 않는다", () => {
    expect(
      buildSeoTitle({ title: "기초연금", applyEnd: null, today, keyword: "신청자격·방법" }),
    ).toBe("기초연금 신청자격·방법 — 정책알리미");
  });

  it("마감일이 비날짜 텍스트면 연도를 붙이지 않는다(상시년 방지)", () => {
    expect(
      buildSeoTitle({ title: "기초연금", applyEnd: "상시모집", today, keyword: "신청자격·방법" }),
    ).toBe("기초연금 신청자격·방법 — 정책알리미");
  });

  it("datetime 형식(YYYY-MM-DDThh:mm)도 날짜부분으로 정상 처리한다", () => {
    expect(
      buildSeoTitle({ title: "청년 월세 지원", applyEnd: "2026-12-31T23:59:59", today, keyword: "신청자격·방법" }),
    ).toBe("2026년 청년 월세 지원 신청자격·방법 — 정책알리미");
  });

  it("날짜 뒤 잡문자가 붙어도 앞 10자 날짜로 판정한다", () => {
    expect(
      buildSeoTitle({ title: "청년 월세 지원", applyEnd: "2026-12-31마감", today, keyword: "신청자격·방법" }),
    ).toBe("2026년 청년 월세 지원 신청자격·방법 — 정책알리미");
  });

  it("정책명에 이미 연도가 있으면 중복으로 붙이지 않는다", () => {
    expect(
      buildSeoTitle({ title: "2026 청년도약계좌", applyEnd: "2026-12-31", today, keyword: "지원대상·한도" }),
    ).toBe("2026 청년도약계좌 지원대상·한도 — 정책알리미");
  });

  it("정제된 정책명이 24자를 넘으면 키워드를 생략한다(잘림 방지)", () => {
    const longTitle = "저소득 한부모가정 아동양육비 및 추가아동양육비 통합 지원 사업";
    expect(buildSeoTitle({ title: longTitle, applyEnd: null, today, keyword: "신청자격·방법" })).toBe(
      `${longTitle} — 정책알리미`,
    );
  });

  it("연도 prefix 때문에 24자를 넘으면 키워드를 생략한다", () => {
    // base 22자 + "2026년 "(6자) = 28자 → 키워드 생략, 연도는 유지
    const title = "서울특별시 청년 1인가구 주거안정 월세 한시 지원";
    expect(
      buildSeoTitle({ title, applyEnd: "2026-12-31", today, keyword: "신청자격·방법" }),
    ).toBe(`2026년 ${title} — 정책알리미`);
  });
});
