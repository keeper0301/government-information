// ============================================================
// weekly-scrape-monitor 단위 테스트 — 사고 분석·권장 fix·학습
// ============================================================
// pure helper (formatWeeklyReport) 만 검증. collectWeeklyMonitor 는 DB 의존.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  formatWeeklyReport,
  type WeeklyMonitorReport,
} from "@/lib/monitoring/weekly-scrape-monitor";

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
    trend: {
      lastWeekAlerts: 0,
      repeatingAlerts: [],
      sajangSuncheonDelta: null,
    },
  };
}

describe("formatWeeklyReport — 정상 운영", () => {
  it("사고 0 시 '안정 운영' 표시", () => {
    const txt = formatWeeklyReport(baseReport());
    expect(txt).toContain("✓ 사고 신호 없음 (안정 운영)");
  });

  it("도시별 inserted/skipped 표시", () => {
    const txt = formatWeeklyReport(baseReport());
    expect(txt).toContain("순천시: inserted 50");
    expect(txt).toContain("skipped 10");
  });

  it("사장님 거주지 매칭 갯수 + 변동 (null → '' 표시)", () => {
    const txt = formatWeeklyReport(baseReport());
    expect(txt).toContain("47건");
    // delta null 케이스
    expect(txt).not.toContain("↑");
    expect(txt).not.toContain("↓");
  });
});

describe("formatWeeklyReport — 사고 신호", () => {
  it("alerts 있으면 '🚨 사고 신호' 헤더 + 항목", () => {
    const report = baseReport();
    report.alerts = ["🚫 순천시 사이트 차단 의심"];
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("🚨 사고 신호:");
    expect(txt).toContain("순천시 사이트 차단 의심");
  });

  it("recommendations 있으면 '💡 권장 조치' 표시", () => {
    const report = baseReport();
    report.recommendations = [
      {
        severity: "high",
        title: "scrape cron 누락",
        suggestion: "Vercel cron 가동 확인",
        autoApplicable: false,
      },
    ];
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("💡 권장 조치:");
    expect(txt).toContain("🔴 scrape cron 누락");
  });
});

describe("formatWeeklyReport — 학습 (직전 주 비교)", () => {
  it("sajangSuncheonDelta > 0 → '+N ↑' 표시", () => {
    const report = baseReport();
    report.trend.sajangSuncheonDelta = 5;
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("47건 (+5 ↑)");
  });

  it("sajangSuncheonDelta < 0 → '-N ↓' 표시", () => {
    const report = baseReport();
    report.trend.sajangSuncheonDelta = -3;
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("47건 (-3 ↓)");
  });

  it("sajangSuncheonDelta === 0 → '변동 0'", () => {
    const report = baseReport();
    report.trend.sajangSuncheonDelta = 0;
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("변동 0");
  });

  it("repeatingAlerts 있으면 '🔁 2주 연속' 헤더", () => {
    const report = baseReport();
    report.trend.repeatingAlerts = ["⚠️ 순천시 skipped 비율 60%"];
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("🔁 2주 연속 같은 사고:");
    expect(txt).toContain("순천시 skipped 비율");
  });
});

describe("formatWeeklyReport — severity icon 분기", () => {
  it("high → 🔴 / medium → 🟡 / low → 🟢", () => {
    const report = baseReport();
    report.recommendations = [
      { severity: "high", title: "H", suggestion: "h", autoApplicable: false },
      { severity: "medium", title: "M", suggestion: "m", autoApplicable: false },
      { severity: "low", title: "L", suggestion: "l", autoApplicable: false },
    ];
    const txt = formatWeeklyReport(report);
    expect(txt).toContain("🔴 H");
    expect(txt).toContain("🟡 M");
    expect(txt).toContain("🟢 L");
  });
});
