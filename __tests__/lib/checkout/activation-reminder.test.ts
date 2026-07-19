import { describe, expect, it } from "vitest";
import { getActivationReminder } from "@/lib/checkout/activation-reminder";

describe("getActivationReminder", () => {
  it("does not show reminders to free users", () => {
    expect(getActivationReminder({
      tier: "free",
      hasBusinessProfile: false,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    })).toBeNull();
  });

  it("prioritizes business profile for paid users", () => {
    const reminder = getActivationReminder({
      tier: "basic",
      hasBusinessProfile: false,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    });

    expect(reminder?.action).toBe("business_profile");
    expect(reminder?.href).toBe("/mypage/business");
  });

  it("prompts Pro users for Kakao consent after business profile exists", () => {
    const reminder = getActivationReminder({
      tier: "pro",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    });

    expect(reminder?.action).toBe("kakao_consent");
    expect(reminder?.href).toBe("/mypage#consents");
  });

  it("prompts paid users for notification setup after other core prerequisites", () => {
    const reminder = getActivationReminder({
      tier: "basic",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    });

    expect(reminder?.action).toBe("notifications");
    expect(reminder?.href).toBe("/mypage/notifications");
  });

  it("hides when paid activation prerequisites are complete", () => {
    expect(getActivationReminder({
      tier: "pro",
      hasBusinessProfile: true,
      hasKakaoConsent: true,
      hasActiveAlertRule: true,
    })).toBeNull();
  });
});
