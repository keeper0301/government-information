// ============================================================
// Search Console KPI 단위 테스트 — pure function 만 커버
// ============================================================

import { describe, it, expect } from "vitest";
import { extractScMetricsFromRow } from "@/lib/monitoring/sc-metrics-trend";
import type { AuditRow } from "@/lib/monitoring/adsense-revenue-trend";

function rowWithScKpis(
  kpis: Record<string, unknown>,
  createdAt = "2026-05-19T01:30:00Z",
): AuditRow {
  // 실제 prod schema 미러
  return {
    details: {
      results_summary: [
        { console: "site", kpis: { ok_count: 5 }, alert_keys: [], alerts_count: 0 },
        { console: "search_console", kpis, alert_keys: [], alerts_count: 0 },
      ],
    },
    created_at: createdAt,
  };
}

describe("extractScMetricsFromRow", () => {
  it("정상 kpis → 4 metric 채워서 반환", () => {
    const row = rowWithScKpis({
      clicks: 270,
      impressions: 8181,
      ctr: 0.033,
      avg_position: 12.5,
    });
    const m = extractScMetricsFromRow(row);
    expect(m).not.toBeNull();
    expect(m!.clicks).toBe(270);
    expect(m!.impressions).toBe(8181);
    expect(m!.ctr).toBe(0.033);
    expect(m!.avgPosition).toBe(12.5);
    expect(m!.observedAt).toBe("2026-05-19T01:30:00Z");
  });

  it("clicks=0 + impressions=0 → 카드 표시 가능 (null 아님)", () => {
    const row = rowWithScKpis({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      avg_position: 0,
    });
    const m = extractScMetricsFromRow(row);
    expect(m).not.toBeNull();
    expect(m!.clicks).toBe(0);
    expect(m!.impressions).toBe(0);
  });

  it("env 미설정 row (kpis 빈 객체) → null (clicks 키 부재)", () => {
    const row = rowWithScKpis({});
    expect(extractScMetricsFromRow(row)).toBeNull();
  });

  it("search_console console 부재 row → null", () => {
    const row: AuditRow = {
      details: {
        results_summary: [
          { console: "adsense", kpis: { earnings_today: 5 }, alert_keys: [], alerts_count: 0 },
        ],
      },
      created_at: "2026-05-19T00:00:00Z",
    };
    expect(extractScMetricsFromRow(row)).toBeNull();
  });

  it("details 부재 row → null", () => {
    const row: AuditRow = { details: null, created_at: "2026-05-19T00:00:00Z" };
    expect(extractScMetricsFromRow(row)).toBeNull();
  });

  it("results_summary 가 array 아님 (옛 schema) → null", () => {
    const row: AuditRow = {
      details: { consoles: { search_console: { kpis: { clicks: 100 } } } },
      created_at: "2026-05-19T00:00:00Z",
    };
    expect(extractScMetricsFromRow(row)).toBeNull();
  });

  it("일부 metric 누락 → 0 fallback", () => {
    const row = rowWithScKpis({ clicks: 50 });
    const m = extractScMetricsFromRow(row);
    expect(m!.clicks).toBe(50);
    expect(m!.impressions).toBe(0);
    expect(m!.ctr).toBe(0);
    expect(m!.avgPosition).toBe(0);
  });
});
