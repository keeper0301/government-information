import { describe, expect, it } from "vitest";
import {
  buildRegisteredUsersDashboard,
  filterRegisteredUserRows,
} from "@/lib/admin/users-dashboard";

describe("registered users dashboard", () => {
  const dashboard = buildRegisteredUsersDashboard({
    now: new Date("2026-07-20T00:00:00.000Z"),
    users: [
      {
        id: "u_free",
        email: "free@keepioo.test",
        created_at: "2026-07-18T00:00:00.000Z",
        last_sign_in_at: "2026-07-19T00:00:00.000Z",
        email_confirmed_at: "2026-07-18T00:05:00.000Z",
        app_metadata: { providers: ["email"] },
      },
      {
        id: "u_paid",
        email: "paid@keepioo.test",
        created_at: "2026-07-17T00:00:00.000Z",
        last_sign_in_at: "2026-06-01T00:00:00.000Z",
        email_confirmed_at: null,
        app_metadata: { providers: ["google"] },
      },
      {
        id: "u_missing",
        email: "missing@keepioo.test",
        created_at: "2026-07-16T00:00:00.000Z",
        last_sign_in_at: null,
        email_confirmed_at: "2026-07-16T00:05:00.000Z",
        app_metadata: null,
      },
    ],
    profiles: [
      {
        id: "u_free",
        region: "seoul",
        sub_district: "gangnam",
        occupation: "자영업자",
        age_group: "30s",
        income_level: "middle",
        interests: ["창업", "소상공인"],
        created_at: "2026-07-18T00:10:00.000Z",
        updated_at: "2026-07-18T00:20:00.000Z",
      },
      {
        id: "u_paid",
        region: "busan",
        sub_district: null,
        occupation: "프리랜서",
        age_group: "40s",
        income_level: "high",
        interests: "대출, 주거",
        created_at: "2026-07-17T00:10:00.000Z",
        updated_at: null,
      },
    ],
    subscriptions: [
      {
        user_id: "u_paid",
        tier: "pro",
        status: "active",
        current_period_end: "2026-08-17T00:00:00.000Z",
        trial_ends_at: null,
        updated_at: "2026-07-17T00:20:00.000Z",
      },
    ],
    alertRules: [
      { user_id: "u_free", is_active: true },
      { user_id: "u_free", is_active: false },
      { user_id: "u_paid", is_active: false },
    ],
  });

  it("builds registered user KPIs and newest-first rows", () => {
    expect(dashboard.stats).toEqual({
      totalUsers: 3,
      confirmedEmails: 2,
      unconfirmedEmails: 1,
      profiledUsers: 2,
      missingProfileUsers: 1,
      activeLast30Days: 1,
      freeUsers: 2,
      paidUsers: 1,
      activeAlertUsers: 1,
    });
    expect(dashboard.rows.map((row) => row.userId)).toEqual(["u_free", "u_paid", "u_missing"]);
    expect(dashboard.rows[1].tier).toBe("pro");
    expect(dashboard.rows[1].interests).toEqual(["대출", "주거"]);
  });

  it("filters by query, tier, profile, email confirmation, and active alerts", () => {
    expect(filterRegisteredUserRows(dashboard.rows, { query: "자영업" }).map((row) => row.userId)).toEqual(["u_free"]);
    expect(filterRegisteredUserRows(dashboard.rows, { tier: "paid" }).map((row) => row.userId)).toEqual(["u_paid"]);
    expect(filterRegisteredUserRows(dashboard.rows, { profile: "missing" }).map((row) => row.userId)).toEqual(["u_missing"]);
    expect(filterRegisteredUserRows(dashboard.rows, { emailConfirmed: "no" }).map((row) => row.userId)).toEqual(["u_paid"]);
    expect(filterRegisteredUserRows(dashboard.rows, { alert: "active" }).map((row) => row.userId)).toEqual(["u_free"]);
    expect(filterRegisteredUserRows(dashboard.rows, { alert: "none" }).map((row) => row.userId)).toEqual(["u_paid", "u_missing"]);
  });
});
