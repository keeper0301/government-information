import { describe, expect, it } from "vitest";

import { assessApprovalFactRisks } from "@/lib/naver-blog/approval-candidate";

const source = {
  type: "welfare" as const,
  id: "source-1",
  title: "저소득 건강보험료 지원",
  source: "청주시",
  sourceUrl: "https://example.go.kr/source",
  applyUrl: null,
  applyStart: null,
  applyEnd: null,
  applyMethod: null,
  requiredDocuments: null,
  benefits: "건강보험료 및 노인장기요양보험료 지원",
  contactInfo: null,
};

describe("Naver approval candidate factual risk gate", () => {
  it("holds unsupported facts and truncated copy", () => {
    const reasons = assessApprovalFactRisks({
      title: "2026년 청주시 건강보험료 지원",
      content:
        "연중 신청이 가능한 것으로 보이나 주민센터 방문 신청이 일반적일 수 있습니다. " +
        "주민등록등본과 통장 사본을 준비하면 보험료 일부 또는 전부를 지원받을 수 있습니…",
      source,
    });

    expect(reasons).toEqual(
      expect.arrayContaining([
        "truncated_or_ellipsis_claim_present",
        "speculative_or_unsupported_claim_present",
        "year_claim_not_supported_by_source_dates",
        "application_method_claim_not_supported_by_source",
        "required_document_claim_not_supported_by_source",
        "benefit_amount_claim_not_supported_by_source",
      ]),
    );
  });

  it("passes copy that stays within official source evidence", () => {
    expect(
      assessApprovalFactRisks({
        title: "청주시 저소득 건강보험료 지원",
        content: "지원 대상과 신청 방법은 복지로 공식 페이지에서 확인하세요.",
        source,
      }),
    ).toEqual([]);
  });
});