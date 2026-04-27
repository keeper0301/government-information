import { describe, it, expect } from "vitest";
import {
  computeDaysLeft,
  computeExpiresAt,
  MARKETING_CONSENT_EXPIRY_WARN_DAYS,
  MARKETING_CONSENT_VALID_DAYS,
} from "@/lib/consent";

// ============================================================
// computeExpiresAt — 정보통신망법 제50조의8 (광고성 동의 2년 만료)
// ============================================================
describe("computeExpiresAt", () => {
  it("marketing 동의 → 2년 후 ISO", () => {
    const consentedAt = "2026-04-27T00:00:00.000Z";
    const expected = new Date(
      new Date(consentedAt).getTime() +
        MARKETING_CONSENT_VALID_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(computeExpiresAt("marketing", consentedAt)).toBe(expected);
  });

  it("kakao_messaging 동의 → 2년 후 ISO", () => {
    const consentedAt = "2026-04-27T00:00:00.000Z";
    const result = computeExpiresAt("kakao_messaging", consentedAt);
    expect(result).not.toBeNull();
    // 730일 = 2년 (윤년 일부 미포함, 코드 정의대로)
    const diffDays =
      (new Date(result!).getTime() - new Date(consentedAt).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(730);
  });

  it("privacy_policy → null (만료 개념 없음)", () => {
    expect(computeExpiresAt("privacy_policy", "2026-04-27T00:00:00Z")).toBeNull();
  });

  it("terms → null", () => {
    expect(computeExpiresAt("terms", "2026-04-27T00:00:00Z")).toBeNull();
  });

  it("sensitive_topic → null (광고성 아님)", () => {
    expect(
      computeExpiresAt("sensitive_topic", "2026-04-27T00:00:00Z"),
    ).toBeNull();
  });

  it("잘못된 ISO 문자열 → null", () => {
    expect(computeExpiresAt("marketing", "invalid-date")).toBeNull();
  });
});

// ============================================================
// computeDaysLeft — 60일 임박 안내·자동 만료 처리
// ============================================================
describe("computeDaysLeft", () => {
  it("60일 후 만료 → 60", () => {
    const now = new Date("2026-04-27T00:00:00Z");
    const expiresAt = new Date(
      now.getTime() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(computeDaysLeft(expiresAt, now)).toBe(60);
  });

  it("정확히 0일 = 오늘 만료 → 0", () => {
    const now = new Date("2026-04-27T12:00:00Z");
    const expiresAt = new Date(now.getTime()).toISOString();
    expect(computeDaysLeft(expiresAt, now)).toBe(0);
  });

  it("이미 만료(어제) → 음수", () => {
    const now = new Date("2026-04-27T00:00:00Z");
    const expiresAt = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(computeDaysLeft(expiresAt, now)).toBe(-1);
  });

  it("null expiresAt → null (만료 개념 없는 동의)", () => {
    expect(computeDaysLeft(null)).toBeNull();
  });

  it("잘못된 ISO → null", () => {
    expect(computeDaysLeft("not-a-date")).toBeNull();
  });
});

// ============================================================
// 60일 임박 임계값 상수
// ============================================================
describe("MARKETING_CONSENT_EXPIRY_WARN_DAYS", () => {
  it("60일", () => {
    expect(MARKETING_CONSENT_EXPIRY_WARN_DAYS).toBe(60);
  });
});

describe("MARKETING_CONSENT_VALID_DAYS", () => {
  it("2년 = 730일 (정통망법 제50조의8)", () => {
    expect(MARKETING_CONSENT_VALID_DAYS).toBe(730);
  });
});
