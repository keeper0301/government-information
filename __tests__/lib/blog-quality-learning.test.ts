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
            improvements: ["  ", 123, "신청 절차 보강", "서류 조건 보강", "마감일 보강"],
          },
        },
      ],
      2,
    );

    expect(hints).toEqual(["신청 절차 보강", "서류 조건 보강"]);
  });

  it("SNS/CTA 오염 힌트는 다음 글 생성 프롬프트에 넣지 않는다", () => {
    const hints = extractQualityImprovementHints(
      [
        {
          details: {
            improvements: [
              "저장/검색 CTA를 더 강하게 추가",
              "인스타 카드 제목처럼 짧게",
              "여러분, 이거 그냥 넘기면 안 돼요 문구 활용",
              "공식 신청 링크 확인 문구 추가",
              "제출 서류 확인 포인트 보강",
            ],
          },
        },
      ],
      3,
    );

    expect(hints).toEqual([
      "공식 신청 링크 확인 문구 추가",
      "제출 서류 확인 포인트 보강",
    ]);
  });
});
