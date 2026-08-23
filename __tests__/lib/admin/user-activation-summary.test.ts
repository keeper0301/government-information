import { describe, expect, it } from "vitest";
import { buildUserActivationSummary } from "@/lib/admin/user-activation-summary";

describe("user activation summary", () => {
  it("flags active paid users with zero watch configuration", () => {
    const summary = buildUserActivationSummary({
      tier: "basic",
      subscriptionStatus: "trialing",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      subscriptionCreatedAt: "2026-07-01T00:00:00.000Z",
      nowIso: "2026-07-02T01:00:00.000Z",
    });

    expect(summary.statusLabel).toBe("24h+ 감시 0개");
    expect(summary.isStaleNoWatch).toBe(true);
    expect(summary.activationAgeDays).toBe(1);
    expect(summary.hasAnyWatch).toBe(false);
    expect(summary.gaps).toContain("감시 설정 0개");
    expect(summary.nextAction).toContain("알림센터");
  });

  it("treats policy-detail deadline alerts as activation progress", () => {
    const summary = buildUserActivationSummary({
      tier: "basic",
      subscriptionStatus: "active",
      hasBusinessProfile: false,
      hasKakaoConsent: false,
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 1,
    });

    expect(summary.statusLabel).toBe("일부 설정 누락");
    expect(summary.hasAnyWatch).toBe(true);
    expect(summary.gaps).not.toContain("감시 설정 0개");
    expect(summary.gaps).toContain("맞춤 알림 규칙 없음");
  });

  it("prioritizes non-pending payment state before activation coaching", () => {
    const summary = buildUserActivationSummary({
      tier: "pro",
      subscriptionStatus: "past_due",
      hasBusinessProfile: true,
      hasKakaoConsent: true,
      activeAlertRulesCount: 1,
      savedDeadlineAlertsCount: 0,
    });

    expect(summary.statusLabel).toBe("결제/구독 상태 확인 필요");
    expect(summary.nextAction).toContain("Toss");
  });

  it("flags recent pending checkout users for card-registration follow-up", () => {
    const summary = buildUserActivationSummary({
      tier: "basic",
      subscriptionStatus: "pending",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      subscriptionCreatedAt: "2026-07-02T18:00:00.000Z",
      nowIso: "2026-07-03T00:00:00.000Z",
    });

    expect(summary.statusLabel).toBe("pending 24h");
    expect(summary.isRecentPending24h).toBe(true);
    expect(summary.isActivePaid).toBe(false);
    expect(summary.activationAgeDays).toBe(0);
    expect(summary.nextAction).toContain("카드 등록 전 이탈 후보");
  });

  it("keeps older pending users in payment follow-up instead of pending 24h", () => {
    const summary = buildUserActivationSummary({
      tier: "basic",
      subscriptionStatus: "pending",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      subscriptionCreatedAt: "2026-07-01T18:00:00.000Z",
      nowIso: "2026-07-03T00:00:00.000Z",
    });

    expect(summary.statusLabel).toBe("결제/구독 상태 확인 필요");
    expect(summary.isRecentPending24h).toBe(false);
    expect(summary.activationAgeDays).toBe(1);
    expect(summary.nextAction).toContain("Toss");
  });
});
