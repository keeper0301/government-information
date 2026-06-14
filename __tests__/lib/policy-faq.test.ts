// ============================================================
// buildPolicyFaqs — 핵심정보 → FAQ Q&A 변환 단위 테스트
// ============================================================
// 라벨 매핑·빈 값 제외·길이 cut 의 silent 회귀 방어.

import { describe, it, expect } from "vitest";
import { buildPolicyFaqs } from "@/lib/policy-faq";

describe("buildPolicyFaqs", () => {
  it("알려진 라벨을 질문으로 변환한다", () => {
    const faqs = buildPolicyFaqs([
      { label: "자격 요건", value: "만 19~34세 청년" },
      { label: "신청 방법", value: "온라인 신청" },
    ]);
    expect(faqs).toEqual([
      { question: "신청 자격은 어떻게 되나요?", answer: "만 19~34세 청년" },
      { question: "어떻게 신청하나요?", answer: "온라인 신청" },
    ]);
  });

  it("값이 없거나(null/빈문자) 모르는 라벨은 제외한다", () => {
    const faqs = buildPolicyFaqs([
      { label: "자격 요건", value: null },
      { label: "혜택 내용", value: "   " },
      { label: "알 수 없는 라벨", value: "값있음" },
      { label: "대출 한도", value: "최대 7천만원" },
    ]);
    expect(faqs).toEqual([{ question: "대출 한도는 얼마인가요?", answer: "최대 7천만원" }]);
  });

  it("답변이 500자를 넘으면 잘라낸다", () => {
    const long = "가".repeat(600);
    const faqs = buildPolicyFaqs([{ label: "혜택 내용", value: long }]);
    expect(faqs[0].answer.length).toBe(500);
  });

  it("변환 가능한 항목이 없으면 빈 배열", () => {
    expect(buildPolicyFaqs([{ label: "자격 요건", value: null }])).toEqual([]);
    expect(buildPolicyFaqs([])).toEqual([]);
  });
});
