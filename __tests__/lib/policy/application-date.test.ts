import { describe, expect, it, vi, afterEach } from "vitest";
import { applicationDaysLeft, isApplicationClosed, validApplicationDate } from "@/lib/policy/application-date";
import { calcDday } from "@/lib/utils";

afterEach(() => vi.useRealTimers());
describe("KST 신청 마감일", () => {
  it.each([
    ["2026-06-29T14:59:59Z", 1, false],
    ["2026-06-29T15:00:00Z", 0, false],
    ["2026-06-30T14:59:59Z", 0, false],
    ["2026-06-30T15:00:00Z", -1, true],
  ])("%s", (instant, days, closed) => {
    const now = new Date(instant);
    // June 30 is inclusive. Use a fixed June 30 deadline.
    expect(applicationDaysLeft("2026-06-30", now)).toBe(days);
    expect(isApplicationClosed("2026-06-30", now)).toBe(closed);
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect(calcDday("2026-06-30")).toBe(days < 0 ? null : days);
  });
  it.each([null, "", "상시", "0000-01-01", "2026-02-30", "2026-13-01", "2026-06-30T00:00:00Z"])("미확인/잘못된 값 %s", (value) => {
    expect(validApplicationDate(value)).toBeNull();
    expect(applicationDaysLeft(value)).toBeNull();
    expect(isApplicationClosed(value)).toBe(false);
  });
});
