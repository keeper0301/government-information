import { describe, expect, it } from "vitest";
import { isExternalPublishQualityApproved } from "@/lib/blog/quality-gate";

describe("isExternalPublishQualityApproved", () => {
  it("품질 검수 통과 글만 외부 자동 발행을 허용한다", () => {
    expect(
      isExternalPublishQualityApproved({ admin_review_required: false }),
    ).toBe(true);
  });

  it("검수 필요 글은 외부 자동 발행을 막는다", () => {
    expect(
      isExternalPublishQualityApproved({ admin_review_required: true }),
    ).toBe(false);
  });

  it("아직 검수되지 않은 글도 외부 자동 발행을 막는다", () => {
    expect(
      isExternalPublishQualityApproved({ admin_review_required: null }),
    ).toBe(false);
  });
});
