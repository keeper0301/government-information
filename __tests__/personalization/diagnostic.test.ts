import { describe, expect, it } from "vitest";
import {
  traceScore,
  summarizeTrace,
  type BlockReason,
} from "@/lib/personalization/diagnostic";
import type { ScorableItem } from "@/lib/personalization/score";
import type { UserSignals } from "@/lib/personalization/types";

const baseProgram: ScorableItem = {
  id: "p1",
  title: "테스트 정책",
  description: "지원 사업입니다",
  region: null,
  district: null,
  benefit_tags: ["취업"],
  apply_end: null,
  source: "광역도청",
  household_target_tags: null,
  income_target_level: null,
};

const baseUser: UserSignals = {
  ageGroup: "40대",
  region: "전남",
  district: null,
  occupation: "자영업자",
  incomeLevel: null,
  householdTypes: [],
  benefitTags: [],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

describe("traceScore — 차단 사유 분류", () => {
  it("정책 region=서울 + 사용자 region=전남 → regional_gate", () => {
    const r = traceScore(
      { ...baseProgram, region: "서울특별시" },
      baseUser,
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("regional_gate");
    expect(r.score).toBe(0);
  });

  it("정책 household_target=[single_parent] + 사용자=[married] → household_gate", () => {
    const r = traceScore(
      { ...baseProgram, household_target_tags: ["single_parent"] },
      { ...baseUser, householdTypes: ["married"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("household_gate");
  });

  it("정책 본문 '결혼이민자' + 일반 사용자 → cohort_mismatch", () => {
    // baseUser 는 결혼이민자 cohort 신호 없음 (occupation=자영업자, 별도 시그널 X)
    // production score.ts 의 MULTICULTURAL_COHORT 키워드 매칭으로 차단
    const r = traceScore(
      {
        ...baseProgram,
        description:
          "결혼이민자 가족 정착 지원 사업 — 한국어 교육 및 생활 적응 지원",
      },
      baseUser,
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("cohort_mismatch");
    expect(r.excerptForCohort).not.toBeNull();
  });

  it("정책 본문 신호 0 + 사용자 입력 0 → no_signal 또는 below_min_score", () => {
    const r = traceScore(
      { ...baseProgram, description: "공지", benefit_tags: [] },
      {
        ...baseUser,
        ageGroup: null,
        region: null,
        occupation: null,
        benefitTags: [],
      },
      8,
    );
    expect(["no_signal", "below_min_score"]).toContain(r.blockReason);
  });

  it("정책 region+benefit 매칭 + score ≥ 8 → shown", () => {
    const r = traceScore(
      {
        ...baseProgram,
        region: "전라남도",
        benefit_tags: ["취업"],
        title: "전남 자영업자 지원사업",
      },
      { ...baseUser, benefitTags: ["취업"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("shown");
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it("score 1 ≤ score < minScore → below_min_score", () => {
    const r = traceScore(
      {
        ...baseProgram,
        region: null,
        benefit_tags: ["취업"],
      },
      { ...baseUser, benefitTags: ["취업"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("below_min_score");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(8);
  });
});

describe("summarizeTrace", () => {
  it("100건 입력 → blocked 카운트 합 + shown = total", () => {
    const traces = Array.from({ length: 100 }, (_, i): ReturnType<typeof traceScore> => ({
      programId: `p${i}`,
      programTitle: `정책 ${i}`,
      score: i % 5,
      signals: [],
      blockReason: i < 30 ? "shown" : "cohort_mismatch",
      programRegion: null,
      programHouseholdTags: null,
      programBenefitTags: [],
      excerptForCohort: null,
      cohortKind: i < 30 ? null : "elderly",
    }));
    const s = summarizeTrace(traces);
    expect(s.total).toBe(100);
    expect(s.shown).toBe(30);
    expect(s.blocked.cohort_mismatch).toBe(70);
    const blockedSum = Object.values(s.blocked).reduce((a, b) => a + b, 0);
    expect(s.shown + blockedSum).toBe(s.total);
  });

  it("점수 분포 4 bucket 합 = total", () => {
    const traces = [0, 0, 1, 3, 4, 7, 8, 10].map((score, i): ReturnType<typeof traceScore> => ({
      programId: `p${i}`,
      programTitle: "p",
      score,
      signals: [],
      blockReason: score >= 8 ? "shown" : "below_min_score",
      programRegion: null,
      programHouseholdTags: null,
      programBenefitTags: [],
      excerptForCohort: null,
      cohortKind: null,
    }));
    const s = summarizeTrace(traces);
    const bucketSum = s.scoreDistribution.reduce((a, b) => a + b.count, 0);
    expect(bucketSum).toBe(8);
  });
});
