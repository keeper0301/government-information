import { describe, expect, it } from "vitest";
import {
  buildCandidateUpsert,
  buildLoanInsertPayload,
  buildWelfareInsertPayload,
  type PressCandidateForConfirm,
} from "@/lib/press-ingest/candidates";
import type { ClassifyResult } from "@/lib/press-ingest/classify";

const policyResult: ClassifyResult = {
  is_policy: true,
  program_type: "welfare",
  title: "전남 청년 주거비 지원",
  target: "전남 거주 청년",
  eligibility: "전라남도 거주 만 19~39세 청년",
  benefits: "월 20만원 주거비 지원",
  apply_method: "온라인 신청",
  apply_url: "https://example.go.kr/apply",
  apply_start: "2026-05-01",
  apply_end: "2026-05-31",
  category: "주거",
};

describe("press ingest L2 candidate mapping", () => {
  it("LLM 정책 결과를 pending confirm 후보로 저장한다", () => {
    expect(
      buildCandidateUpsert({
        newsId: "11111111-1111-1111-1111-111111111111",
        result: policyResult,
      }),
    ).toMatchObject({
      news_id: "11111111-1111-1111-1111-111111111111",
      status: "pending",
      program_type: "welfare",
      title: "전남 청년 주거비 지원",
      category: "주거",
      skip_reason: null,
    });
  });

  it("비정책 또는 unsure 결과는 skipped 후보로 저장한다", () => {
    const nonPolicy = buildCandidateUpsert({
      newsId: "11111111-1111-1111-1111-111111111111",
      result: { ...policyResult, is_policy: false, program_type: "unsure" },
    });
    expect(nonPolicy.status).toBe("skipped");
    expect(nonPolicy.program_type).toBe("not_policy");
    expect(nonPolicy.skip_reason).toBe("not_policy");

    const unsure = buildCandidateUpsert({
      newsId: "11111111-1111-1111-1111-111111111111",
      result: { ...policyResult, program_type: "unsure" },
    });
    expect(unsure.status).toBe("skipped");
    expect(unsure.program_type).toBe("unsure");
    expect(unsure.skip_reason).toBe("program_type_unsure");
  });
});

describe("press ingest confirm payloads", () => {
  const candidate: PressCandidateForConfirm = {
    id: "22222222-2222-2222-2222-222222222222",
    news_id: "11111111-1111-1111-1111-111111111111",
    status: "pending",
    program_type: "welfare",
    title: "전남 청년 주거비 지원",
    category: "주거",
    classified_payload: policyResult,
    news: {
      id: "11111111-1111-1111-1111-111111111111",
      ministry: "전라남도",
      slug: "jeonnam-youth-housing",
    },
  };

  it("pending welfare 후보를 welfare_programs INSERT payload 로 변환한다", () => {
    const payload = buildWelfareInsertPayload(candidate);
    expect(payload).toMatchObject({
      title: "전남 청년 주거비 지원",
      category: "주거",
      region: "전라남도",
      source: "전라남도청",
      source_code: "press_l2_confirm",
      source_id: "11111111-1111-1111-1111-111111111111",
      apply_url: "https://example.go.kr/apply",
    });
    expect(payload.region_tags).toContain("전남");
    expect(payload.benefit_tags).toContain("주거");
  });

  it("pending loan 후보를 loan_programs INSERT payload 로 변환한다", () => {
    const payload = buildLoanInsertPayload({
      ...candidate,
      program_type: "loan",
      category: "정책자금",
      classified_payload: {
        ...policyResult,
        program_type: "loan",
        category: "정책자금",
        loan_amount: "최대 5,000만원",
        interest_rate: "연 2%",
        repayment_period: "5년",
      },
    });
    expect(payload).toMatchObject({
      category: "정책자금",
      source: "전라남도청",
      source_code: "press_l2_confirm",
      source_id: "11111111-1111-1111-1111-111111111111",
      loan_amount: "최대 5,000만원",
      interest_rate: "연 2%",
      repayment_period: "5년",
    });
    expect(payload).not.toHaveProperty("region");
    expect(payload.region_tags).toContain("전남");
  });
});
