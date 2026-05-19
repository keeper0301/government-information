// ============================================================
// 5 외부 console KPI 단위 테스트 — pure function 만 커버
// ============================================================

import { describe, it, expect } from "vitest";
import {
  extractGa4Metrics,
  extractVercelMetrics,
  extractSupabaseMetrics,
  extractKakaoMetrics,
  extractTossMetrics,
} from "@/lib/monitoring/external-console-kpis";
import type { AuditRow } from "@/lib/monitoring/adsense-revenue-trend";

function rowWith(
  consoleName: string,
  kpis: Record<string, unknown>,
  createdAt = "2026-05-19T01:30:00Z",
): AuditRow {
  return {
    details: {
      results_summary: [
        { console: consoleName, kpis, alert_keys: [], alerts_count: 0 },
      ],
    },
    created_at: createdAt,
  };
}

describe("extractGa4Metrics", () => {
  it("정상 kpis → 3 metric 반환", () => {
    const row = rowWith("ga4", {
      sessions: 120,
      active_users: 85,
      bounce_rate: 0.42,
    });
    const m = extractGa4Metrics(row);
    expect(m!.sessions).toBe(120);
    expect(m!.activeUsers).toBe(85);
    expect(m!.bounceRate).toBe(0.42);
  });

  it("sessions=0 → 카드 표시 가능 (null 아님)", () => {
    const row = rowWith("ga4", { sessions: 0, active_users: 0, bounce_rate: 0 });
    expect(extractGa4Metrics(row)).not.toBeNull();
  });

  it("kpis 빈 객체 → null (sessions 키 부재)", () => {
    expect(extractGa4Metrics(rowWith("ga4", {}))).toBeNull();
  });

  it("다른 console row → null", () => {
    expect(extractGa4Metrics(rowWith("adsense", { sessions: 1 }))).toBeNull();
  });
});

describe("extractVercelMetrics", () => {
  it("정상 kpis → 5 metric 반환", () => {
    const row = rowWith("vercel", {
      total_24h: 19,
      failed_24h: 1,
      failure_rate: 0.053,
      latest_state: "BUILDING",
      latest_uid: "dpl_EAFhFDKai3ap2VRyxnKVeynsxVZu",
    });
    const m = extractVercelMetrics(row);
    expect(m!.total24h).toBe(19);
    expect(m!.failed24h).toBe(1);
    expect(m!.failureRate).toBe(0.053);
    expect(m!.latestState).toBe("BUILDING");
    expect(m!.latestUid).toBe("dpl_EAFhFDKai3ap2VRyxnKVeynsxVZu");
  });

  it("kpis 빈 객체 → null", () => {
    expect(extractVercelMetrics(rowWith("vercel", {}))).toBeNull();
  });

  it("latest_state 누락 → null fallback", () => {
    const row = rowWith("vercel", { total_24h: 5 });
    expect(extractVercelMetrics(row)!.latestState).toBeNull();
  });
});

describe("extractSupabaseMetrics", () => {
  it("정상 kpis → 5 metric 반환", () => {
    const row = rowWith("supabase", {
      project_status: "ACTIVE_HEALTHY",
      project_region: "ap-northeast-2",
      project_name: "government_infomation",
      advisor_warn: 5,
      advisor_error: 0,
    });
    const m = extractSupabaseMetrics(row);
    expect(m!.projectStatus).toBe("ACTIVE_HEALTHY");
    expect(m!.projectRegion).toBe("ap-northeast-2");
    expect(m!.advisorWarn).toBe(5);
    expect(m!.advisorError).toBe(0);
  });

  it("kpis 빈 객체 → null", () => {
    expect(extractSupabaseMetrics(rowWith("supabase", {}))).toBeNull();
  });
});

describe("extractKakaoMetrics", () => {
  it("정상 kpis → 8 metric 반환", () => {
    const row = rowWith("kakao", {
      balance_total: 17,
      balance_cash: 0,
      balance_point: 17,
      total_24h: 4,
      success_24h: 4,
      failed_24h: 0,
      pending_24h: 0,
      failure_rate: 0,
    });
    const m = extractKakaoMetrics(row);
    expect(m!.balanceTotal).toBe(17);
    expect(m!.balanceCash).toBe(0);
    expect(m!.balancePoint).toBe(17);
    expect(m!.total24h).toBe(4);
    expect(m!.success24h).toBe(4);
    expect(m!.failureRate).toBe(0);
  });

  it("kpis 빈 객체 → null", () => {
    expect(extractKakaoMetrics(rowWith("kakao", {}))).toBeNull();
  });
});

describe("extractTossMetrics", () => {
  it("정상 kpis → 4 metric 반환", () => {
    const row = rowWith("toss", {
      active_total: 1,
      new_active_24h: 0,
      cancelled_24h: 0,
      churn_rate_24h: 0,
    });
    const m = extractTossMetrics(row);
    expect(m!.activeTotal).toBe(1);
    expect(m!.newActive24h).toBe(0);
    expect(m!.cancelled24h).toBe(0);
    expect(m!.churnRate24h).toBe(0);
  });

  it("kpis 빈 객체 → null", () => {
    expect(extractTossMetrics(rowWith("toss", {}))).toBeNull();
  });

  it("active_total 0 → 카드 표시 가능", () => {
    const row = rowWith("toss", {
      active_total: 0,
      new_active_24h: 0,
      cancelled_24h: 0,
      churn_rate_24h: 0,
    });
    expect(extractTossMetrics(row)).not.toBeNull();
  });
});

describe("schema regression — 옛 consoles object schema", () => {
  it("results_summary 부재 → 모든 extractor null", () => {
    const row: AuditRow = {
      details: { consoles: { ga4: { kpis: { sessions: 100 } } } },
      created_at: "2026-05-19T00:00:00Z",
    };
    expect(extractGa4Metrics(row)).toBeNull();
    expect(extractVercelMetrics(row)).toBeNull();
    expect(extractSupabaseMetrics(row)).toBeNull();
    expect(extractKakaoMetrics(row)).toBeNull();
    expect(extractTossMetrics(row)).toBeNull();
  });
});
