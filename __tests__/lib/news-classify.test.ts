import { describe, expect, it } from "vitest";
import {
  decideAutoModeration,
  AUTO_HIDE_CONFIDENCE_THRESHOLD,
} from "@/lib/news/classify";

describe("decideAutoModeration", () => {
  it("광고성 + confidence ≥ 0.7 → hide", () => {
    const decision = decideAutoModeration({
      is_advertorial: true,
      is_copyright_risk: false,
      confidence: 0.9,
      reason: "할인 이벤트 명시적 마케팅",
    });
    expect(decision.action).toBe("hide");
    expect(decision.reason).toContain("자동: 광고성");
  });

  it("저작권 위반 + confidence ≥ 0.7 → hide", () => {
    const decision = decideAutoModeration({
      is_advertorial: false,
      is_copyright_risk: true,
      confidence: 0.85,
      reason: "특정 매체 기사 전문 복붙",
    });
    expect(decision.action).toBe("hide");
    expect(decision.reason).toContain("자동: 저작권 의심");
  });

  it("광고성 단정이지만 confidence < 0.7 → keep (안전 default)", () => {
    const decision = decideAutoModeration({
      is_advertorial: true,
      is_copyright_risk: false,
      confidence: 0.5,
      reason: "애매함",
    });
    expect(decision.action).toBe("keep");
  });

  it("정상 (광고성·저작권 모두 false) → keep", () => {
    const decision = decideAutoModeration({
      is_advertorial: false,
      is_copyright_risk: false,
      confidence: 0.95,
      reason: "정상",
    });
    expect(decision.action).toBe("keep");
  });

  it("confidence 정확히 0.7 → hide (경계값 inclusive)", () => {
    const decision = decideAutoModeration({
      is_advertorial: true,
      is_copyright_risk: false,
      confidence: AUTO_HIDE_CONFIDENCE_THRESHOLD,
      reason: "임계값",
    });
    expect(decision.action).toBe("hide");
  });

  it("광고성·저작권 모두 true (confidence 높음) → 광고성 우선 hide", () => {
    const decision = decideAutoModeration({
      is_advertorial: true,
      is_copyright_risk: true,
      confidence: 0.95,
      reason: "둘 다",
    });
    expect(decision.action).toBe("hide");
    expect(decision.reason).toContain("광고성");
  });

  it("AUTO_HIDE_CONFIDENCE_THRESHOLD = 0.7 (운영 임계치)", () => {
    expect(AUTO_HIDE_CONFIDENCE_THRESHOLD).toBe(0.7);
  });
});
