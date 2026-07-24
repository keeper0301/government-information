import { describe, expect, it } from "vitest";
import {
  buildCandidateUpsert,
  buildLoanInsertPayload,
  buildLowReviewBoard,
  buildWelfareInsertPayload,
  classifyLowReviewBucket,
  eligibleAutoConfirmTiers,
  shouldAutoConfirm,
  type PressCandidateForConfirm,
  type PressCandidateListRow,
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
  confidence: "high",
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

describe("press ingest auto-confirm tier filter", () => {
  it("floor=mid일 때 high/mid만 자동승인 대상으로 고른다", () => {
    expect(eligibleAutoConfirmTiers("high")).toEqual(["high"]);
    expect(eligibleAutoConfirmTiers("mid")).toEqual(["high", "mid"]);
    expect(eligibleAutoConfirmTiers("low")).toEqual(["high", "mid", "low"]);
  });

  it("legacy/null tier는 자동승인에서 제외한다", () => {
    expect(shouldAutoConfirm(null, "mid")).toBe(false);
    expect(shouldAutoConfirm("low", "mid")).toBe(false);
    expect(shouldAutoConfirm("mid", "mid")).toBe(true);
  });
});

function makeLowRow(overrides: Partial<PressCandidateListRow> = {}): PressCandidateListRow {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    news_id: "11111111-1111-1111-1111-111111111111",
    status: "pending",
    program_type: "welfare",
    title: "전남 청년 주거비 지원",
    category: "주거",
    classified_payload: { ...policyResult, apply_end: "2026-06-30" },
    skip_reason: null,
    error_message: null,
    classified_at: "2026-06-14T00:00:00.000Z",
    created_at: "2026-06-14T00:00:00.000Z",
    updated_at: "2026-06-14T00:00:00.000Z",
    confidence_tier: "low",
    news: {
      id: "11111111-1111-1111-1111-111111111111",
      ministry: "전라남도",
      slug: "jeonnam-youth-housing",
    },
    ...overrides,
  };
}

describe("press ingest low review board", () => {
  const now = new Date("2026-06-15T09:00:00.000Z");

  it("LOW 후보를 승인 가능/URL 보강/마감/묵음 bucket 으로 read-only 분류한다", () => {
    expect(classifyLowReviewBucket(makeLowRow(), now)).toBe("confirm_ready");
    expect(
      classifyLowReviewBucket(
        makeLowRow({ classified_payload: { ...policyResult, apply_url: null, apply_end: "2026-06-30" } }),
        now,
      ),
    ).toBe("missing_url");
    expect(
      classifyLowReviewBucket(
        makeLowRow({ classified_payload: { ...policyResult, apply_end: "2026-06-14" } }),
        now,
      ),
    ).toBe("deadline_expired");
    expect(
      classifyLowReviewBucket(makeLowRow({ created_at: "2026-05-20T00:00:00.000Z" }), now),
    ).toBe("stale_review");
  });

  it("LOW 검수판은 pending LOW만 집계하고 자동승인은 계속 차단 상태로 표시한다", () => {
    const board = buildLowReviewBoard(
      [
        makeLowRow(),
        makeLowRow({ classified_payload: { ...policyResult, apply_url: null, apply_end: "2026-06-30" } }),
        makeLowRow({ classified_payload: { ...policyResult, apply_end: "2026-06-14" } }),
        makeLowRow({ created_at: "2026-05-20T00:00:00.000Z" }),
        makeLowRow({ confidence_tier: "mid" }),
        makeLowRow({ status: "confirmed" }),
      ],
      now,
    );

    expect(board.total).toBe(4);
    expect(board.buckets).toEqual({
      confirm_ready: 1,
      missing_url: 1,
      deadline_expired: 1,
      stale_review: 1,
    });
    expect(board.autoConfirmSafe).toBe(false);
    expect(board.topAction).toContain("수동 승인");
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
      source: "전남도청",
      source_code: "press_l2_confirm",
      source_id: "11111111-1111-1111-1111-111111111111",
      apply_url: "https://example.go.kr/apply",
      apply_start: "2026-05-01",
      apply_end: "2026-05-31",
    });
    expect(payload.region_tags).toContain("전남");
    expect(payload.benefit_tags).toContain("주거");
  });

  it("low tier 자동 승인도 auto_confirm_tier='low' 로 감사 메타를 남긴다", () => {
    const payload = buildWelfareInsertPayload(candidate, { autoConfirmTier: "low" });
    expect(payload.auto_confirm_tier).toBe("low");
    expect(payload.auto_confirmed_at).toEqual(expect.any(String));
  });

  it("LLM이 뱉은 불완전/placeholder 날짜는 DB insert 전에 null로 낮춘다", () => {
    const payload = buildWelfareInsertPayload({
      ...candidate,
      classified_payload: {
        ...policyResult,
        apply_start: "2023-06-",
        apply_end: "YYYY-MM-DD",
      },
    });
    expect(payload.apply_start).toBeNull();
    expect(payload.apply_end).toBeNull();
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
      source: "전남도청",
      source_code: "press_l2_confirm",
      source_id: "11111111-1111-1111-1111-111111111111",
      loan_amount: "최대 5,000만원",
      interest_rate: "연 2%",
      repayment_period: "5년",
    });
    // migration 090 후 loan_programs.region 도 신설 — extractor 가 자동 추출
    expect(payload.region).toBe("전라남도");
    expect(payload.region_tags).toContain("전남");
  });
});
