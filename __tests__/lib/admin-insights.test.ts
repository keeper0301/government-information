import { describe, expect, it } from "vitest";
import { buildSubscriptionPulse } from "@/lib/admin-insights";

describe("admin insights subscription pulse", () => {
  it("separates checkout intent, pending drop-off, and no-watch paid users", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");

    const pulse = buildSubscriptionPulse({
      now,
      subscriptions: [
        { user_id: "u_trial_no_watch", status: "trialing", created_at: "2026-08-22T11:30:00.000Z" },
        { user_id: "u_active_rule", status: "active", created_at: "2026-08-21T10:00:00.000Z" },
        { user_id: "u_active_deadline", status: "active", created_at: "2026-08-21T10:00:00.000Z" },
        { user_id: "u_pending_recent", status: "pending", created_at: "2026-08-22T11:00:00.000Z" },
        { user_id: "u_pending_old", status: "pending", created_at: "2026-08-20T11:00:00.000Z" },
        { user_id: "u_cancelled", status: "cancelled", created_at: "2026-08-22T11:00:00.000Z" },
      ],
      activeAlertRuleUserIds: ["u_active_rule"],
      activeAlarmSubscriptionUserIds: ["u_active_deadline"],
    });

    expect(pulse).toEqual({
      activeNoWatch: 1,
      trialingNoWatch: 1,
      pending24h: 1,
    });
  });
});
