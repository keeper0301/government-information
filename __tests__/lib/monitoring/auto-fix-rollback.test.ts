// ============================================================
// D-4 step 4 rollback 감지 단위 테스트
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase admin mock — admin_actions fetch 차단
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import {
  analyzeRollback,
  formatRollbackAlerts,
} from "@/lib/monitoring/auto-fix-rollback";
import * as supabase from "@/lib/supabase/admin";
import type { WeeklyMonitorReport } from "@/lib/monitoring/weekly-scrape-monitor";

function mockSupabaseReturn(details: unknown) {
  vi.mocked(supabase.createAdminClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: details
                    ? { details, created_at: "2026-05-12T00:30:00Z" }
                    : null,
                }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof supabase.createAdminClient>);
}

function baseReport(): WeeklyMonitorReport {
  return {
    rangeStart: "2026-05-12T00:00:00Z",
    rangeEnd: "2026-05-19T00:00:00Z",
    scrapeCronRuns: 7,
    scrapeMissingDays: 0,
    cities: [
      {
        city: "순천시",
        ministry: "전라남도 순천시",
        cronInserted: 5,
        cronSkipped: 15,
        cronErrors: 0,
        skippedRate: 0.75, // 사고 재발
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

describe("analyzeRollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("직전 cron audit 없음 → 빈 배열", async () => {
    mockSupabaseReturn(null);
    expect(await analyzeRollback(baseReport())).toEqual([]);
  });

  it("직전 audit 의 d4_step3_prs 없음 → 빈 배열", async () => {
    mockSupabaseReturn({ d4_step3_prs: [] });
    expect(await analyzeRollback(baseReport())).toEqual([]);
  });

  it("직전 PR + 사고 재발 (skippedRate > 50%) → rollback alert", async () => {
    mockSupabaseReturn({
      d4_step3_prs: [
        { pr: 42, branch: "auto-fix/2026-05-12-suncheon", domain: "suncheon" },
      ],
    });
    const alerts = await analyzeRollback(baseReport());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      prNumber: 42,
      domain: "suncheon",
      currentSkippedRate: 0.75,
    });
    expect(alerts[0].reason).toContain("75%");
    expect(alerts[0].revertGuideUrl).toContain("/pull/42");
  });

  it("직전 PR + 사고 안 재발 → 빈 배열", async () => {
    mockSupabaseReturn({
      d4_step3_prs: [
        { pr: 42, branch: "auto-fix/2026-05-12-suncheon", domain: "suncheon" },
      ],
    });
    const report = baseReport();
    report.cities[0].skippedRate = 0.1; // 정상
    report.cities[0].cronSkipped = 2;
    expect(await analyzeRollback(report)).toEqual([]);
  });

  it("siteBlockedSuspect 재발 → rollback alert", async () => {
    mockSupabaseReturn({
      d4_step3_prs: [
        { pr: 99, branch: "auto-fix/x", domain: "gwangju" },
      ],
    });
    const report = baseReport();
    report.cities[0] = {
      city: "광주광역시",
      ministry: "광주광역시",
      cronInserted: 0,
      cronSkipped: 0,
      cronErrors: 0,
      skippedRate: 0,
      siteBlockedSuspect: true,
    };
    const alerts = await analyzeRollback(report);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].reason).toContain("차단");
  });

  it("malformed audit entry → 안전 skip", async () => {
    mockSupabaseReturn({
      d4_step3_prs: [
        { pr: null, branch: "x", domain: "suncheon" }, // pr null
        "invalid", // not object
      ],
    });
    expect(await analyzeRollback(baseReport())).toEqual([]);
  });
});

describe("formatRollbackAlerts", () => {
  it("빈 배열 → 빈 문자열", () => {
    expect(formatRollbackAlerts([])).toBe("");
  });

  it("alert 있으면 '🔄 D-4 step 4 (rollback 권고)' 헤더 + 가이드 메시지", () => {
    const txt = formatRollbackAlerts([
      {
        prNumber: 42,
        domain: "suncheon",
        currentSkippedRate: 0.75,
        reason: "skipped 75%",
        revertGuideUrl: "https://github.com/x/y/pull/42",
      },
    ]);
    expect(txt).toContain("🔄 D-4 step 4");
    expect(txt).toContain("PR #42");
    expect(txt).toContain("Revert");
    expect(txt).toContain("/pull/42");
  });

  it("3건 초과 시 cap", () => {
    const alerts = Array.from({ length: 5 }, (_, i) => ({
      prNumber: i + 1,
      domain: "x",
      currentSkippedRate: 0.6,
      reason: "test",
      revertGuideUrl: `https://x/pull/${i + 1}`,
    }));
    const txt = formatRollbackAlerts(alerts);
    expect(txt).toContain("PR #1");
    expect(txt).toContain("PR #3");
    expect(txt).not.toContain("PR #4");
  });
});
