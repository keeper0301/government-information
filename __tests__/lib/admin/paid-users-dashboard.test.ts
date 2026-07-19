import { describe, expect, it } from "vitest";
import {
  buildPaidUsersDashboard,
  getActivationGaps,
  isPaidActiveStatus,
} from "@/lib/admin/paid-users-dashboard";

describe("paid users dashboard helpers", () => {
  it("classifies active paid statuses consistently", () => {
    expect(isPaidActiveStatus("trialing")).toBe(true);
    expect(isPaidActiveStatus("active")).toBe(true);
    expect(isPaidActiveStatus("manual_grant")).toBe(true);
    expect(isPaidActiveStatus("past_due")).toBe(false);
    expect(isPaidActiveStatus("cancelled")).toBe(false);
  });

  it("detects activation gaps by tier", () => {
    expect(getActivationGaps({
      tier: "basic",
      hasBusinessProfile: false,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    })).toEqual(["business_profile", "notifications"]);

    expect(getActivationGaps({
      tier: "pro",
      hasBusinessProfile: true,
      hasKakaoConsent: false,
      hasActiveAlertRule: false,
    })).toEqual(["kakao_consent", "notifications"]);
  });

  it("builds whole-dashboard KPIs independent of filtered UI concerns", () => {
    const dashboard = buildPaidUsersDashboard({
      subscriptions: [
        {
          user_id: "u_basic",
          tier: "basic",
          status: "active",
          customer_email: "basic@keepioo.test",
          card_company: "현대카드",
          card_number_masked: "1234-****-****-5678",
          trial_ends_at: null,
          current_period_end: "2026-08-01T00:00:00.000Z",
          cancelled_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-10T00:00:00.000Z",
        },
        {
          user_id: "u_pro",
          tier: "pro",
          status: "past_due",
          customer_email: null,
          card_company: null,
          card_number_masked: null,
          trial_ends_at: null,
          current_period_end: "2026-08-01T00:00:00.000Z",
          cancelled_at: null,
          created_at: "2026-07-02T00:00:00.000Z",
          updated_at: "2026-07-11T00:00:00.000Z",
        },
      ],
      users: [
        { id: "u_basic", email: "basic@auth.test", created_at: "2026-06-01T00:00:00.000Z" },
        { id: "u_pro", email: "pro@auth.test", created_at: "2026-06-02T00:00:00.000Z" },
      ],
      payments: [
        { user_id: "u_basic", tier: "basic", amount: 4900, status: "DONE", paid_at: "2026-07-10T00:00:00.000Z", created_at: "2026-07-10T00:00:00.000Z" },
        { user_id: "u_basic", tier: "basic", amount: 4900, status: "FAILED", paid_at: null, created_at: "2026-07-09T00:00:00.000Z" },
      ],
      businessUserIds: ["u_basic", "u_pro"],
      kakaoConsentUserIds: [],
      activeAlertRuleUserIds: ["u_basic"],
    });

    expect(dashboard.stats.totalPaidRows).toBe(2);
    expect(dashboard.stats.activeTotal).toBe(1);
    expect(dashboard.stats.activeBasic).toBe(1);
    expect(dashboard.stats.activePro).toBe(0);
    expect(dashboard.stats.monthlyRevenueEstimate).toBe(4900);
    expect(dashboard.stats.pastDue).toBe(1);
    expect(dashboard.stats.missingProKakaoConsent).toBe(1);
    expect(dashboard.rows[0].userId).toBe("u_pro");
    expect(dashboard.rows[0].interviewSegment).toBe("payment_risk");
    expect(dashboard.rows[1].email).toBe("basic@auth.test");
    expect(dashboard.rows[1].lastPaymentStatus).toBe("DONE");
  });
});
