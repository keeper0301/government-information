import { describe, expect, it } from "vitest";
import { scoreReelCandidate } from "@/lib/instagram/reel-quality";

describe("scoreReelCandidate", () => {
  it("approves broad, concrete Reels candidates", () => {
    const result = scoreReelCandidate({
      slug: "youth-rent",
      title: "2026년 서울 청년 월세 지원 신청 안내",
      category: "청년 주거",
      meta_description: "청년 월세 지원은 소득 조건을 충족한 청년에게 월 최대 20만원을 지원합니다.",
      content: "대상은 19세부터 34세 청년이며 부모와 따로 거주해야 합니다. 지원 금액은 월 최대 20만원이며 최대 12개월까지 받을 수 있습니다. 신청 기간은 2026년 7월까지이며 복지로 또는 주민센터에서 신청할 수 있습니다.",
    });

    expect(result.approved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.reasons).toHaveLength(0);
    expect(result.metrics).toMatchObject({
      hasAmount: true,
      hasTarget: true,
      hasBenefit: true,
      hasApply: true,
      preferredTopic: true,
      narrowOrSensitiveTopic: false,
      hasConcreteDetail: true,
    });
  });

  it("blocks narrow or thin candidates that would make weak Reels", () => {
    const result = scoreReelCandidate({
      slug: "return-home",
      title: "2026년 양양군 무연고자 귀향 지원 안내",
      category: "복지",
      meta_description: "귀향 지원 사업 안내입니다.",
      content: "무연고자와 행려자의 귀향을 지원합니다. 자세한 내용은 담당 기관에 문의하세요.",
    });

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("reel_narrow_or_sensitive_topic");
    expect(result.reasons).toContain("reel_information_score_low");
  });
});
