import { describe, expect, it } from "vitest";
import { buildMypageWatchStatus } from "@/lib/mypage/watch-status";

describe("buildMypageWatchStatus", () => {
  it("routes free users to the Basic watch funnel", () => {
    const status = buildMypageWatchStatus({
      tier: "free",
      hasBusinessProfile: false,
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      hasKakaoConsent: false,
    });

    expect(status.tone).toBe("locked");
    expect(status.headline).toContain("꺼져");
    expect(status.primaryAction.href).toBe("/pricing?from=mypage-watch&recommended=basic");
    expect(status.score).toBe(0);
  });

  it("pushes paid users without business profile to finish setup", () => {
    const status = buildMypageWatchStatus({
      tier: "basic",
      hasBusinessProfile: false,
      activeAlertRulesCount: 1,
      savedDeadlineAlertsCount: 0,
      hasKakaoConsent: false,
    });

    expect(status.tone).toBe("setup");
    expect(status.primaryAction.href).toBe("/mypage/business?from=mypage-watch");
    expect(status.steps.find((step) => step.label === "맞춤 감시 조건")?.done).toBe(true);
  });

  it("marks the watch system active when paid user has profile and alert state", () => {
    const status = buildMypageWatchStatus({
      tier: "basic",
      hasBusinessProfile: true,
      activeAlertRulesCount: 2,
      savedDeadlineAlertsCount: 3,
      hasKakaoConsent: false,
    });

    expect(status.tone).toBe("active");
    expect(status.headline).toContain("작동 중");
    expect(status.description).toContain("2개 맞춤 조건");
    expect(status.description).toContain("3개 정책별 알림");
    expect(status.primaryAction.href).toBe("/alerts?from=mypage-watch");
  });

  it("adds Kakao as a Pro-only readiness step", () => {
    const basic = buildMypageWatchStatus({
      tier: "basic",
      hasBusinessProfile: true,
      activeAlertRulesCount: 1,
      savedDeadlineAlertsCount: 1,
      hasKakaoConsent: false,
    });
    const pro = buildMypageWatchStatus({
      tier: "pro",
      hasBusinessProfile: true,
      activeAlertRulesCount: 1,
      savedDeadlineAlertsCount: 1,
      hasKakaoConsent: false,
    });

    expect(basic.total).toBe(4);
    expect(pro.total).toBe(5);
    expect(pro.steps.some((step) => step.label === "카카오 알림톡" && !step.done)).toBe(true);
  });
});
