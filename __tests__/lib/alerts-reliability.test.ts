import { describe, expect, it } from "vitest";
import { buildAlertReliabilitySummary } from "@/lib/alerts/reliability";

describe("buildAlertReliabilitySummary", () => {
  it("routes free users to the Basic deadline-watch funnel", () => {
    const summary = buildAlertReliabilitySummary({
      tier: "free",
      hasBusinessProfile: false,
      activeAlertRulesCount: 0,
      hasEmail: true,
      hasKakaoConsent: false,
    });

    expect(summary.score).toBe(1);
    expect(summary.total).toBe(4);
    expect(summary.headline).toContain("자동 마감 감시");
    expect(summary.primaryAction.href).toBe("/pricing?from=alerts&recommended=basic");
  });

  it("tells paid users without a business profile to finish the core setup", () => {
    const summary = buildAlertReliabilitySummary({
      tier: "basic",
      hasBusinessProfile: false,
      activeAlertRulesCount: 1,
      hasEmail: true,
      hasKakaoConsent: false,
    });

    expect(summary.score).toBe(3);
    expect(summary.primaryAction.href).toBe("/mypage/business?from=alerts-reliability");
    expect(summary.steps.find((step) => step.key === "alert_rule")?.description).toContain("1개 조건");
  });

  it("shows the Kakao consent step only for Pro users", () => {
    const basic = buildAlertReliabilitySummary({
      tier: "basic",
      hasBusinessProfile: true,
      activeAlertRulesCount: 2,
      hasEmail: true,
      hasKakaoConsent: false,
    });
    const pro = buildAlertReliabilitySummary({
      tier: "pro",
      hasBusinessProfile: true,
      activeAlertRulesCount: 2,
      hasEmail: true,
      hasKakaoConsent: false,
    });

    expect(basic.total).toBe(4);
    expect(basic.steps.some((step) => step.key === "kakao")).toBe(false);
    expect(pro.total).toBe(5);
    expect(pro.steps.some((step) => step.key === "kakao" && !step.done)).toBe(true);
    expect(pro.primaryAction.href).toBe("/mypage#consents");
  });
});
