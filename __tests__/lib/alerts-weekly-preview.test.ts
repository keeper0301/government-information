import { describe, expect, it } from "vitest";
import { buildWeeklyAlertPreview, calcKstDday, programHref } from "@/lib/alerts/weekly-preview";
import type { MatchedProgram } from "@/lib/alerts/matching";

function program(overrides: Partial<MatchedProgram> = {}): MatchedProgram {
  return {
    id: "w1",
    title: "청년 창업 지원금",
    source: "중소벤처기업부",
    apply_url: "https://example.com",
    apply_end: "2026-08-30",
    published_at: "2026-08-22T00:00:00.000Z",
    description: "창업 지원",
    household_target_tags: null,
    district: null,
    table: "welfare_programs",
    ...overrides,
  };
}

describe("weekly alert preview", () => {
  it("locks weekly report preview for free users", () => {
    const preview = buildWeeklyAlertPreview({
      tier: "free",
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      matchedPrograms: [],
      today: "2026-08-22",
    });

    expect(preview.locked).toBe(true);
    expect(preview.primaryAction.href).toBe("/pricing?from=alerts&recommended=basic");
    expect(preview.metricValue).toBe("꺼짐");
  });

  it("asks paid users without rules to create a watch condition", () => {
    const preview = buildWeeklyAlertPreview({
      tier: "basic",
      activeAlertRulesCount: 0,
      savedDeadlineAlertsCount: 0,
      matchedPrograms: [],
      today: "2026-08-22",
    });

    expect(preview.locked).toBe(false);
    expect(preview.headline).toContain("조건이 없어요");
    expect(preview.primaryAction.href).toBe("/mypage/notifications?from=weekly-preview");
  });

  it("summarizes new matched policies and sorts imminent deadlines first", () => {
    const preview = buildWeeklyAlertPreview({
      tier: "basic",
      activeAlertRulesCount: 2,
      savedDeadlineAlertsCount: 1,
      today: "2026-08-22",
      matchedPrograms: [
        program({ id: "late", title: "늦은 정책", apply_end: "2026-09-20", table: "loan_programs" }),
        program({ id: "soon", title: "곧 마감", apply_end: "2026-08-25" }),
      ],
    });

    expect(preview.headline).toContain("2건");
    expect(preview.metricValue).toBe("1건");
    expect(preview.items.map((item) => item.id)).toEqual(["soon", "late"]);
    expect(preview.items[0].href).toBe("/welfare/soon");
    expect(preview.items[1].href).toBe("/loan/late");
  });

  it("calculates KST dday and policy hrefs", () => {
    expect(calcKstDday("2026-08-25", "2026-08-22")).toBe(3);
    expect(calcKstDday(null, "2026-08-22")).toBeNull();
    expect(programHref(program({ table: "loan_programs", id: "l1" }))).toBe("/loan/l1");
  });
});
