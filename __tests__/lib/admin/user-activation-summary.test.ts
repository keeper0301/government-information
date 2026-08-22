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
    });

    expect(summary.statusLabel).toBe("유료지만 감시 0개");
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

  it("prioritizes payment state before activation coaching", () => {
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
});
