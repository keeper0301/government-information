// ============================================================
// track-token HMAC sign/verify unit test
// ============================================================
// brute-force 공격 차단을 보장하는 회귀 가드.
// CRON_SECRET 누락 시 throw + 잘못된 token format / 잘못된 logId 검증.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signPushLogId,
  verifyPushLogToken,
} from "@/lib/push/track-token";

describe("track-token sign/verify", () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret-for-track-token";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_SECRET;
    }
  });

  it("sign 결과는 16자 hex", () => {
    const token = signPushLogId(123);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });

  it("동일 logId + 동일 secret = 동일 token (deterministic)", () => {
    const a = signPushLogId(999);
    const b = signPushLogId(999);
    expect(a).toBe(b);
  });

  it("다른 logId 는 다른 token (collision 검증)", () => {
    const a = signPushLogId(1);
    const b = signPushLogId(2);
    expect(a).not.toBe(b);
  });

  it("verify — 정상 sign 결과는 true", () => {
    const token = signPushLogId(42);
    expect(verifyPushLogToken(42, token)).toBe(true);
  });

  it("verify — 다른 logId 의 token 은 false (brute-force 차단)", () => {
    const token = signPushLogId(1);
    expect(verifyPushLogToken(2, token)).toBe(false);
  });

  it("verify — 잘못된 길이 token 은 즉시 false", () => {
    expect(verifyPushLogToken(1, "")).toBe(false);
    expect(verifyPushLogToken(1, "short")).toBe(false);
    expect(verifyPushLogToken(1, "x".repeat(15))).toBe(false);
    expect(verifyPushLogToken(1, "x".repeat(17))).toBe(false);
  });

  it("verify — undefined / number / object 등 비-string 은 false", () => {
    expect(verifyPushLogToken(1, undefined)).toBe(false);
    expect(verifyPushLogToken(1, 123 as unknown)).toBe(false);
    expect(verifyPushLogToken(1, {} as unknown)).toBe(false);
    expect(verifyPushLogToken(1, null as unknown)).toBe(false);
  });

  it("verify — 같은 길이지만 다른 문자열 은 false (random guess 차단)", () => {
    expect(verifyPushLogToken(1, "0".repeat(16))).toBe(false);
    expect(verifyPushLogToken(1, "f".repeat(16))).toBe(false);
  });

  it("CRON_SECRET 미설정 시 sign throw (graceful degrade 안 함 — 누락 즉시 인지)", () => {
    delete process.env.CRON_SECRET;
    expect(() => signPushLogId(1)).toThrow(/CRON_SECRET env missing/);
  });

  it("BigInt logId 도 동작", () => {
    const big = BigInt("9007199254740993"); // > Number.MAX_SAFE_INTEGER
    const token = signPushLogId(big);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
    expect(verifyPushLogToken(big, token)).toBe(true);
  });
});
