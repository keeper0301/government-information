import { describe, expect, it } from "vitest";
import {
  buildContactReminderDigest,
  buildContactReminderEmail,
  formatContactReminderText,
  kstDateString,
} from "@/lib/notifications/user-contact-reminder";
import type { RegisteredUserDashboardRow } from "@/lib/admin/users-dashboard";

function row(input: Partial<RegisteredUserDashboardRow> & Pick<RegisteredUserDashboardRow, "userId">): RegisteredUserDashboardRow {
  return {
    userId: input.userId,
    email: input.email ?? `${input.userId}@keepioo.test`,
    authCreatedAt: "2026-07-01T00:00:00.000Z",
    lastSignInAt: null,
    emailConfirmed: true,
    providers: ["email"],
    hasProfile: true,
    profileCreatedAt: null,
    profileUpdatedAt: null,
    region: null,
    subDistrict: null,
    occupation: null,
    ageGroup: null,
    incomeLevel: null,
    interests: [],
    tier: "free",
    subscriptionStatus: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    activeAlertRules: 0,
    totalAlertRules: 0,
    opsStatus: input.opsStatus ?? "waiting_response",
    opsStatusUpdatedAt: null,
    opsStatusIsManual: true,
    opsNote: input.opsNote ?? null,
    nextContactAt: input.nextContactAt ?? null,
  };
}

describe("user contact reminder digest", () => {
  it("uses Asia/Seoul calendar date", () => {
    expect(kstDateString(new Date("2026-07-21T14:59:00.000Z"))).toBe("2026-07-21");
    expect(kstDateString(new Date("2026-07-21T15:00:00.000Z"))).toBe("2026-07-22");
  });

  it("collects due-today and overdue users while excluding future and done rows", () => {
    const digest = buildContactReminderDigest({
      today: "2026-07-22",
      baseUrl: "https://admin.example.com/",
      rows: [
        row({ userId: "today", nextContactAt: "2026-07-22", opsNote: "오늘 오전 카톡" }),
        row({ userId: "late", nextContactAt: "2026-07-20", opsStatus: "contact_needed" }),
        row({ userId: "future", nextContactAt: "2026-07-23" }),
        row({ userId: "done", nextContactAt: "2026-07-22", opsStatus: "done" }),
      ],
    });

    expect(digest.totalDue).toBe(2);
    expect(digest.dueToday.map((item) => item.userId)).toEqual(["today"]);
    expect(digest.overdue.map((item) => item.userId)).toEqual(["late"]);
    expect(digest.overdue[0].daysOverdue).toBe(2);
    expect(digest.dueToday[0].adminUrl).toBe("https://admin.example.com/admin/users/today");
  });

  it("formats telegram text and email content", () => {
    const digest = buildContactReminderDigest({
      today: "2026-07-22",
      rows: [row({ userId: "u1", email: "owner@example.com", nextContactAt: "2026-07-22", opsNote: "Pro 설정 막힘" })],
    });

    const text = formatContactReminderText(digest);
    expect(text).toContain("오늘 연락할 사용자 요약 (2026-07-22)");
    expect(text).toContain("owner@example.com");
    expect(text).toContain("Pro 설정 막힘");

    const email = buildContactReminderEmail(digest);
    expect(email.subject).toContain("오늘 연락할 사용자 1명");
    expect(email.html).toContain("owner@example.com");
    expect(email.text).toContain("관리:");
  });
});
