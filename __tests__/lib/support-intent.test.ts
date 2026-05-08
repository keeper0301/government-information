import { describe, expect, it } from "vitest";
import {
  parseClassificationResponse,
  canAutoReply,
  AUTO_REPLIES,
  SUPPORT_INTENTS,
} from "@/lib/support/intent";

describe("parseClassificationResponse", () => {
  it("정상 JSON 응답 → 정확 파싱", () => {
    const result = parseClassificationResponse(
      '{"intent":"refund_request","confidence":0.85,"reason":"환불 요청"}',
    );
    expect(result.intent).toBe("refund_request");
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toBe("환불 요청");
  });

  it("JSON 앞뒤 텍스트 있어도 파싱 (LLM 종종 prose 추가)", () => {
    const result = parseClassificationResponse(
      '분류해드릴게요.\n{"intent":"bug_report","confidence":0.7,"reason":"오류 신고"}\n끝.',
    );
    expect(result.intent).toBe("bug_report");
  });

  it("JSON 없음 → other / confidence 0", () => {
    const result = parseClassificationResponse("그냥 텍스트");
    expect(result.intent).toBe("other");
    expect(result.confidence).toBe(0);
  });

  it("잘못된 intent → other 로 fallback", () => {
    const result = parseClassificationResponse(
      '{"intent":"hack_attempt","confidence":0.9,"reason":"해킹"}',
    );
    expect(result.intent).toBe("other");
  });

  it("confidence 범위 외 → 0 으로 보정", () => {
    expect(
      parseClassificationResponse(
        '{"intent":"other","confidence":1.5,"reason":"x"}',
      ).confidence,
    ).toBe(0);
    expect(
      parseClassificationResponse(
        '{"intent":"other","confidence":-0.1,"reason":"x"}',
      ).confidence,
    ).toBe(0);
  });

  it("reason 200자 초과 → 잘림", () => {
    const longReason = "x".repeat(300);
    const result = parseClassificationResponse(
      `{"intent":"other","confidence":0.5,"reason":"${longReason}"}`,
    );
    expect(result.reason.length).toBeLessThanOrEqual(200);
  });

  it("JSON 파싱 실패 → other", () => {
    const result = parseClassificationResponse('{intent: invalid json}');
    expect(result.intent).toBe("other");
    expect(result.reason).toContain("json_parse_failed");
  });
});

describe("canAutoReply", () => {
  it("confidence 0.7 이상 + AUTO_REPLIES 매핑 있음 → true", () => {
    expect(canAutoReply("refund_policy_question", 0.7)).toBe(true);
    expect(canAutoReply("account_recovery", 0.85)).toBe(true);
    expect(canAutoReply("pricing_question", 0.9)).toBe(true);
  });

  it("confidence 0.7 미만 → false (small confidence 보호)", () => {
    expect(canAutoReply("refund_policy_question", 0.69)).toBe(false);
    expect(canAutoReply("account_recovery", 0.5)).toBe(false);
  });

  it("AUTO_REPLIES 매핑 없는 intent → false (refund_request 등)", () => {
    expect(canAutoReply("refund_request", 0.95)).toBe(false);
    expect(canAutoReply("bug_report", 0.95)).toBe(false);
    expect(canAutoReply("feature_request", 0.95)).toBe(false);
  });
});

describe("SUPPORT_INTENTS / AUTO_REPLIES 정합성", () => {
  it("AUTO_REPLIES 의 모든 키는 SUPPORT_INTENTS 에 포함", () => {
    for (const k of Object.keys(AUTO_REPLIES)) {
      expect(SUPPORT_INTENTS).toContain(k);
    }
  });

  it("AUTO_REPLIES 본문은 비어있지 않아야 함", () => {
    for (const v of Object.values(AUTO_REPLIES)) {
      expect(v).toBeTruthy();
      expect((v as string).length).toBeGreaterThan(20);
    }
  });
});
