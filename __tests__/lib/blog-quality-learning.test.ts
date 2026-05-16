import { describe, expect, it } from "vitest";
import { extractQualityImprovementHints } from "@/lib/blog/quality-learning";

describe("extractQualityImprovementHints", () => {
  it("admin action details.improvements 에서 최근 개선 힌트를 추출한다", () => {
    const hints = extractQualityImprovementHints([
      {
        details: {
          improvements: [
            "신청 기간을 첫 단락에 추가",
            "공식 신청 링크 확인 문구 추가",
          ],
        },
      },
    ]);

    expect(hints).toEqual([
      "신청 기간을 첫 단락에 추가",
      "공식 신청 링크 확인 문구 추가",
    ]);
  });

  it("빈 값과 비문자 값을 제거하고 limit 만큼만 반환한다", () => {
    const hints = extractQualityImprovementHints(
      [
        {
          details: {
            improvements: ["  ", 123, "CTA 추가", "서류 조건 보강", "마감일 보강"],
          },
        },
      ],
      2,
    );

    expect(hints).toEqual(["CTA 추가", "서류 조건 보강"]);
  });
});
