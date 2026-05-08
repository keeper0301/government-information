import { describe, expect, it } from "vitest";
import {
  parseDecisionReply,
  isAllowedSender,
} from "@/lib/sms/decision-router";

describe("parseDecisionReply", () => {
  it('"1" → approve', () => {
    expect(parseDecisionReply("1")).toBe("approve");
  });

  it('"2" → reject', () => {
    expect(parseDecisionReply("2")).toBe("reject");
  });

  it('"3" → consult', () => {
    expect(parseDecisionReply("3")).toBe("consult");
  });

  it("trim — 양쪽 공백·줄바꿈 무시", () => {
    expect(parseDecisionReply("  1\n")).toBe("approve");
    expect(parseDecisionReply("\t2 ")).toBe("reject");
  });

  it("1/2/3 외엔 null (무시)", () => {
    expect(parseDecisionReply("4")).toBeNull();
    expect(parseDecisionReply("승인")).toBeNull();
    expect(parseDecisionReply("OK")).toBeNull();
    expect(parseDecisionReply("")).toBeNull();
    expect(parseDecisionReply("11")).toBeNull(); // "1" 만 정확히 매칭
  });
});

describe("isAllowedSender", () => {
  const original = process.env.SMS_DECISION_ALLOWED_FROM;

  function withEnv(value: string | undefined, fn: () => void) {
    if (value === undefined) delete process.env.SMS_DECISION_ALLOWED_FROM;
    else process.env.SMS_DECISION_ALLOWED_FROM = value;
    try {
      fn();
    } finally {
      if (original === undefined) delete process.env.SMS_DECISION_ALLOWED_FROM;
      else process.env.SMS_DECISION_ALLOWED_FROM = original;
    }
  }

  it("env 미설정 → 모두 reject (안전 default)", () => {
    withEnv(undefined, () => {
      expect(isAllowedSender("01012345678")).toBe(false);
    });
  });

  it("env 설정 + 정확 매칭 → allow", () => {
    withEnv("01012345678", () => {
      expect(isAllowedSender("01012345678")).toBe(true);
    });
  });

  it("하이픈·공백 정규화 후 매칭", () => {
    withEnv("01012345678", () => {
      expect(isAllowedSender("010-1234-5678")).toBe(true);
      expect(isAllowedSender("010 1234 5678")).toBe(true);
    });
  });

  it("국가코드 +82 prefix 정규화", () => {
    withEnv("01012345678", () => {
      expect(isAllowedSender("+821012345678")).toBe(true);
    });
  });

  it("csv 다중 — 하나라도 매칭하면 allow", () => {
    withEnv("01011112222,01012345678", () => {
      expect(isAllowedSender("01012345678")).toBe(true);
      expect(isAllowedSender("01011112222")).toBe(true);
      expect(isAllowedSender("01099998888")).toBe(false);
    });
  });

  it("매칭 실패 → reject", () => {
    withEnv("01012345678", () => {
      expect(isAllowedSender("01099998888")).toBe(false);
    });
  });
});
