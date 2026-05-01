import { describe, expect, it } from "vitest";
import {
  isRecommendLoanEligible,
  isRecommendWelfareEligible,
} from "@/lib/recommend";
import type { LoanProgram, WelfareProgram } from "@/lib/database.types";
import type { UserSignals } from "@/lib/personalization/types";

const baseUser: UserSignals = {
  ageGroup: null,
  region: null,
  district: null,
  occupation: null,
  incomeLevel: null,
  householdTypes: [],
  benefitTags: [],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

function makeWelfare(overrides: Partial<WelfareProgram>): WelfareProgram {
  return {
    id: "welfare-1",
    title: "청년창업농장학금 지원",
    category: "welfare",
    target: "청년",
    description: "농업 후계 인력 양성을 위한 장학금 지원",
    eligibility: null,
    benefits: null,
    apply_method: null,
    apply_url: null,
    apply_start: null,
    apply_end: null,
    source: "농림축산식품부",
    source_url: null,
    source_code: null,
    region: null,
    serv_id: null,
    detailed_content: null,
    selection_criteria: null,
    required_documents: null,
    contact_info: null,
    last_enriched_at: null,
    view_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    benefit_tags: null,
    age_tags: null,
    occupation_tags: null,
    household_tags: null,
    region_tags: null,
    income_target_level: null,
    household_target_tags: null,
    last_targeting_analyzed_at: null,
    ...overrides,
  };
}

function makeLoan(overrides: Partial<LoanProgram>): LoanProgram {
  return {
    id: "loan-1",
    title: "소상공인 정책자금",
    category: "loan",
    target: "소상공인",
    description: "사업 운영자금 지원",
    eligibility: null,
    loan_amount: null,
    interest_rate: null,
    repayment_period: null,
    apply_method: null,
    apply_url: null,
    apply_start: null,
    apply_end: null,
    source: "중소벤처기업부",
    source_url: null,
    source_code: null,
    detailed_content: null,
    required_documents: null,
    contact_info: null,
    last_enriched_at: null,
    view_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    benefit_tags: null,
    age_tags: null,
    occupation_tags: null,
    household_tags: null,
    region_tags: null,
    income_target_level: null,
    household_target_tags: null,
    last_targeting_analyzed_at: null,
    ...overrides,
  };
}

describe("recommend cohort gate", () => {
  it("blocks disability-only welfare unless mypage profile has disabled_family", () => {
    const program = makeWelfare({
      title: "장애인보장구대여사업",
      description: "장애인보장구 수리 및 대여사업을 추진합니다.",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
    expect(
      isRecommendWelfareEligible(program, {
        ...baseUser,
        householdTypes: ["disabled_family"],
      }),
    ).toBe(true);
  });

  it("blocks justice reentry policies from general recommendations", () => {
    const program = makeWelfare({
      title: "출소(예정)자 취업지원사업(허그일자리지원)",
      target: "출소자, 출소예정자, 보호관찰대상자",
      description: "개인별 적절한 취업지원 서비스를 제공합니다.",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
  });

  it("blocks sensitive mental-health-only welfare from general recommendations", () => {
    const program = makeWelfare({
      title: "정신질환자 치료비 지원 사업",
      target: "조현병 등 정신질환 발병 초기 환자",
      description:
        "정신질환 발병 초기에 집중적인 치료를 유도하고 응급상황 입원 및 퇴원 후에도 치료비를 지원합니다.",
      source: "보건복지부",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
  });

  it("blocks protected-youth-only welfare when mypage profile has no child signal", () => {
    const program = makeWelfare({
      title: "자립준비청년 자립수당 지급",
      target: "보호종료아동",
      description: "보호종료 후 경제적 부담 완화를 위해 자립수당을 지급합니다.",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
  });

  it("allows broadly eligible recommendations", () => {
    expect(isRecommendWelfareEligible(makeWelfare({}), baseUser)).toBe(true);
    expect(isRecommendLoanEligible(makeLoan({}), baseUser)).toBe(true);
  });
});
