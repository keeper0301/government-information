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

  it("blocks vulnerable-student education welfare unless profile is low income or child-related", () => {
    const program = makeWelfare({
      title: "교육복지우선지원사업",
      target: "취약계층 학생이 밀집한 학교의 학생",
      description:
        "취약계층 학생이 밀집한 학교를 선정하여 집중 지원함으로써 교육, 문화, 복지 수준을 높입니다.",
      source: "교육부",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
    expect(
      isRecommendWelfareEligible(program, {
        ...baseUser,
        incomeLevel: "low",
      }),
    ).toBe(true);
  });

  it("blocks farming successor scholarships unless occupation is farmer", () => {
    const program = makeWelfare({
      title: "청년창업농장학금 지원",
      target: "농업 후계인력 및 농업인 자녀",
      description:
        "농업 후계인력과 농업인 자녀 등에게 장학금을 지원하여 우수 농업 후계인력을 양성합니다.",
      source: "농림축산식품부",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
    expect(
      isRecommendWelfareEligible(program, {
        ...baseUser,
        occupation: "농어민",
      }),
    ).toBe(true);
  });

  it("blocks disaster-victim-only welfare from general recommendations", () => {
    const program = makeWelfare({
      title: "재해이재민지원",
      target: "재해 이재민",
      description: "재해이재민 생활안정을 위한 긴급구호 지원",
      source: "전라남도",
    });

    expect(isRecommendWelfareEligible(program, baseUser)).toBe(false);
  });

  it("blocks child-care services when profile explicitly has no children", () => {
    const program = makeWelfare({
      title: "아이돌봄서비스",
      target: "12세 이하 자녀를 양육하는 가정",
      description:
        "맞벌이 등 양육 공백이 생겼을 때 육아 도우미가 방문하여 12세 이하 자녀의 양육을 지원합니다.",
      source: "성평등가족부",
    });

    expect(
      isRecommendWelfareEligible(program, {
        ...baseUser,
        hasChildren: false,
      }),
    ).toBe(false);
    expect(
      isRecommendWelfareEligible(program, {
        ...baseUser,
        hasChildren: true,
      }),
    ).toBe(true);
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
    expect(
      isRecommendWelfareEligible(
        makeWelfare({
          title: "청년 주거비 지원",
          target: "청년",
          description: "청년의 주거비 부담을 줄이기 위한 일반 지원",
          source: "전라남도",
        }),
        baseUser,
      ),
    ).toBe(true);
    expect(isRecommendLoanEligible(makeLoan({}), baseUser)).toBe(true);
  });
});
