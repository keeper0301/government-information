// ============================================================
// Phase D-4 auto-fix 단위 테스트 (step 1 dry-run)
// ============================================================

import { describe, it, expect, vi } from "vitest";
import {
  analyzeForAutoFix,
  formatAutoFixSummary,
  isAutoFixEnabled,
} from "@/lib/monitoring/auto-fix";
import type { WeeklyMonitorReport } from "@/lib/monitoring/weekly-scrape-monitor";

function baseReport(): WeeklyMonitorReport {
  return {
    rangeStart: "2026-05-09T00:00:00.000Z",
    rangeEnd: "2026-05-16T00:00:00.000Z",
    scrapeCronRuns: 7,
    scrapeMissingDays: 0,
    cities: [
      {
        city: "순천시",
        ministry: "전라남도 순천시",
        cronInserted: 50,
        cronSkipped: 10,
        cronErrors: 0,
        skippedRate: 0.166,
        siteBlockedSuspect: false,
      },
    ],
    pressIngestRuns: 21,
    districtMatching: {
      welfareWithDistrict: 7272,
      welfareNullDistrict: 3119,
      loanWithDistrict: 41,
      loanNullDistrict: 1436,
      sajangSuncheonWelfare: 47,
    },
    alerts: [],
    recommendations: [],
    trend: { lastWeekAlerts: 0, repeatingAlerts: [], sajangSuncheonDelta: null },
  };
}

describe("isAutoFixEnabled", () => {
  it("env 미설정 → false", () => {
    const prev = process.env.D4_AUTO_FIX_ENABLED;
    delete process.env.D4_AUTO_FIX_ENABLED;
    expect(isAutoFixEnabled()).toBe(false);
    if (prev !== undefined) process.env.D4_AUTO_FIX_ENABLED = prev;
  });

  it("'true' → true", () => {
    process.env.D4_AUTO_FIX_ENABLED = "true";
    expect(isAutoFixEnabled()).toBe(true);
  });

  it("'1' → true", () => {
    process.env.D4_AUTO_FIX_ENABLED = "1";
    expect(isAutoFixEnabled()).toBe(true);
  });

  it("'false' → false", () => {
    process.env.D4_AUTO_FIX_ENABLED = "false";
    expect(isAutoFixEnabled()).toBe(false);
  });
});

describe("analyzeForAutoFix — 사고 없음", () => {
  it("정상 운영 → 빈 배열", () => {
    expect(analyzeForAutoFix(baseReport())).toEqual([]);
  });
});

describe("analyzeForAutoFix — 사고별 분기", () => {
  it("site blocked → manual_required (skipped)", () => {
    const r = baseReport();
    r.cities[0].siteBlockedSuspect = true;
    const attempts = analyzeForAutoFix(r);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].action).toBe("manual_required");
    expect(attempts[0].status).toBe("skipped");
  });

  it("skipped > 50% + 충분 sample → regex_fix (env 활성화 시 dry_run)", () => {
    process.env.D4_AUTO_FIX_ENABLED = "true";
    const r = baseReport();
    r.cities[0].skippedRate = 0.6;
    r.cities[0].cronInserted = 5;
    r.cities[0].cronSkipped = 15; // total 20 > 10
    const attempts = analyzeForAutoFix(r);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].action).toBe("regex_fix");
    expect(attempts[0].status).toBe("dry_run");
  });

  it("skipped > 50% + env 비활성화 → skipped", () => {
    process.env.D4_AUTO_FIX_ENABLED = "false";
    const r = baseReport();
    r.cities[0].skippedRate = 0.6;
    r.cities[0].cronInserted = 5;
    r.cities[0].cronSkipped = 15;
    const attempts = analyzeForAutoFix(r);
    expect(attempts[0].status).toBe("skipped");
  });

  it("skipped > 50% + sample 부족 (< 10) → 분기 안 함", () => {
    const r = baseReport();
    r.cities[0].skippedRate = 0.6;
    r.cities[0].cronInserted = 2;
    r.cities[0].cronSkipped = 3; // total 5 < 10
    expect(analyzeForAutoFix(r)).toEqual([]);
  });

  it("scrape cron 누락 → manual_required (cron 문제는 fix 위험)", () => {
    const r = baseReport();
    r.scrapeMissingDays = 3;
    const attempts = analyzeForAutoFix(r);
    expect(attempts.some((a) => a.action === "manual_required")).toBe(true);
  });
});

describe("formatAutoFixSummary", () => {
  it("빈 배열 → 빈 문자열 (메시지 추가 X)", () => {
    expect(formatAutoFixSummary([])).toBe("");
  });

  it("attempts 있으면 '🤖 자동 fix 분석' 헤더 + status icon", () => {
    const txt = formatAutoFixSummary([
      {
        trigger: "순천시 skipped 60%",
        domain: "suncheon",
        action: "regex_fix",
        status: "dry_run",
        reason: "테스트",
      },
    ]);
    expect(txt).toContain("🤖 자동 fix 분석");
    expect(txt).toContain("🔬");
    expect(txt).toContain("순천시 skipped 60%");
  });

  it("4건 초과 시 처음 4건만 표시", () => {
    const attempts = Array.from({ length: 6 }, (_, i) => ({
      trigger: `사고 ${i}`,
      domain: "unknown" as const,
      action: "skip" as const,
      status: "skipped" as const,
      reason: `${i}`,
    }));
    const txt = formatAutoFixSummary(attempts);
    expect(txt).toContain("사고 0");
    expect(txt).toContain("사고 3");
    expect(txt).not.toContain("사고 4");
  });
});
