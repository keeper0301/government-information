import { describe, expect, it } from "vitest";
import { extractExternalChannelLearningHints } from "@/lib/blog/external-channel-learning";

describe("extractExternalChannelLearningHints", () => {
  it("인스타와 네이버 발행 결과를 다음 글 생성 힌트로 요약한다", () => {
    const hints = extractExternalChannelLearningHints(
      {
        instagramActions: [
          {
            action: "instagram_publish_fail",
            details: { error: "Graph API media container failed" },
          },
          {
            action: "instagram_publish_success",
            details: { slug: "youth-rent" },
          },
        ],
        naverAudits: [
          {
            result: "fail",
            error_message: "captcha_detected",
            skip_reason: null,
          },
          {
            result: "success",
            error_message: null,
            skip_reason: null,
          },
        ],
      },
      4,
    );

    expect(hints).toEqual([
      expect.stringContaining("인스타 최근 실패 1건"),
      expect.stringContaining("인스타 최근 성공 1건"),
      expect.stringContaining("네이버 최근 보류/실패 1건"),
      expect.stringContaining("네이버 최근 성공 1건"),
    ]);
    expect(hints[0]).toContain("카드 제목·캡션");
    expect(hints[2]).toContain("공식 신청 경로");
  });

  it("빈 행이면 힌트를 만들지 않는다", () => {
    expect(extractExternalChannelLearningHints({})).toEqual([]);
  });

  it("limit 만큼만 반환한다", () => {
    const hints = extractExternalChannelLearningHints(
      {
        instagramActions: [
          { action: "instagram_publish_fail", details: { error: "e1" } },
          { action: "instagram_publish_success", details: {} },
        ],
        naverAudits: [
          { result: "fail", error_message: "e2", skip_reason: null },
          { result: "success", error_message: null, skip_reason: null },
        ],
      },
      2,
    );

    expect(hints).toHaveLength(2);
  });
});
