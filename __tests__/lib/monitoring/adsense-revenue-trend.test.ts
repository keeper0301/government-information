// ============================================================
// AdSense 매출 추세 단위 테스트
// ============================================================

import { describe, it, expect } from "vitest";
import {
  formatRevenueTrend,
  extractAdsenseMetricsFromRow,
  type RevenueTrend,
  type AuditRow,
} from "@/lib/monitoring/adsense-revenue-trend";

function baseTrend(overrides?: Partial<RevenueTrend>): RevenueTrend {
  return {
    daily: [
      { date: "2026-05-10", earnings: 1.5, currency: "USD" },
      { date: "2026-05-11", earnings: 2.0, currency: "USD" },
      { date: "2026-05-12", earnings: 1.8, currency: "USD" },
    ],
    total7d: 5.3,
    avgPerDay: 1.77,
    currency: "USD",
    vsPrev7d: null,
    alerts: [],
    ...overrides,
  };
}

describe("formatRevenueTrend", () => {
  it("데이터 없음 → 안내 메시지", () => {
    expect(formatRevenueTrend({ ...baseTrend(), daily: [] })).toContain(
      "데이터 없음",
    );
  });

  it("일별 매출 + 평균 표시", () => {
    const txt = formatRevenueTrend(baseTrend());
    expect(txt).toContain("USD 5.30");
    expect(txt).toContain("평균 1.77/일");
  });

  it("vsPrev7d 양수 → '+' 부호", () => {
    const txt = formatRevenueTrend(
      baseTrend({ vsPrev7d: { delta: 1.5, deltaPct: 35.5 } }),
    );
    expect(txt).toContain("+1.50");
    expect(txt).toContain("35.5%");
  });

  it("vsPrev7d 음수 → '-' 부호 (자동)", () => {
    const txt = formatRevenueTrend(
      baseTrend({ vsPrev7d: { delta: -2.5, deltaPct: -40.0 } }),
    );
    expect(txt).toContain("-2.50");
    expect(txt).toContain("-40.0%");
  });

  it("vsPrev7d=0 → '±' 부호", () => {
    const txt = formatRevenueTrend(
      baseTrend({ vsPrev7d: { delta: 0, deltaPct: 0 } }),
    );
    expect(txt).toContain("±0.00");
  });

  it("alerts 있으면 메시지 추가", () => {
    const txt = formatRevenueTrend(
      baseTrend({ alerts: ["💸 매출 -30%"] }),
    );
    expect(txt).toContain("매출 -30%");
  });
});

// collectRevenueTrend 는 admin_actions 의존 — separate integration test 가 적절.
// 이 파일에는 format helper test 만.

// ============================================================
// extractAdsenseMetricsFromRow — row 1건 → AdsenseMetricsLatest 변환 (pure)
// ============================================================

function rowWithKpis(kpis: Record<string, unknown>, createdAt = "2026-05-19T01:30:00Z"): AuditRow {
  return {
    details: { consoles: { adsense: { kpis } } },
    created_at: createdAt,
  };
}

describe("extractAdsenseMetricsFromRow", () => {
  it("정상 kpis → 모든 metric 채워서 반환", () => {
    const row = rowWithKpis({
      earnings_today: 123.45,
      currency: "KRW",
      impressions: 1500,
      clicks: 12,
      ad_requests: 1800,
      page_views: 800,
      ctr_pct: 0.8,
      ready_since_hours: 18,
    });
    const m = extractAdsenseMetricsFromRow(row);
    expect(m).not.toBeNull();
    expect(m!.earnings).toBe(123.45);
    expect(m!.currency).toBe("KRW");
    expect(m!.impressions).toBe(1500);
    expect(m!.clicks).toBe(12);
    expect(m!.adRequests).toBe(1800);
    expect(m!.pageViews).toBe(800);
    expect(m!.ctrPct).toBe(0.8);
    expect(m!.readySinceHours).toBe(18);
    expect(m!.observedAt).toBe("2026-05-19T01:30:00Z");
  });

  it("impressions=0 → 카드 표시 가능 (null 아님)", () => {
    const row = rowWithKpis({
      earnings_today: 0,
      currency: "KRW",
      impressions: 0,
      clicks: 0,
      ad_requests: 0,
      page_views: 0,
      ctr_pct: null,
      ready_since_hours: 2,
    });
    const m = extractAdsenseMetricsFromRow(row);
    expect(m!.impressions).toBe(0);
    expect(m!.clicks).toBe(0);
    expect(m!.ctrPct).toBeNull();
    expect(m!.readySinceHours).toBe(2);
  });

  it("metric 일부 null → null 그대로 유지", () => {
    const row = rowWithKpis({
      earnings_today: 0,
      currency: "KRW",
      impressions: null,
      clicks: null,
      ad_requests: null,
      page_views: null,
      ctr_pct: null,
      ready_since_hours: null,
    });
    const m = extractAdsenseMetricsFromRow(row);
    expect(m!.impressions).toBeNull();
    expect(m!.ctrPct).toBeNull();
    expect(m!.readySinceHours).toBeNull();
  });

  it("NOT_FOUND row (account_state 만 있고 earnings_today 부재) → null", () => {
    const row = rowWithKpis({ account_state: "NOT_FOUND" });
    expect(extractAdsenseMetricsFromRow(row)).toBeNull();
  });

  it("env 미설정 row (kpis 빈 객체) → null", () => {
    const row = rowWithKpis({});
    expect(extractAdsenseMetricsFromRow(row)).toBeNull();
  });

  it("details 부재 row → null", () => {
    const row: AuditRow = { details: null, created_at: "2026-05-19T00:00:00Z" };
    expect(extractAdsenseMetricsFromRow(row)).toBeNull();
  });

  it("adsense console 부재 row → null", () => {
    const row: AuditRow = {
      details: { consoles: { search_console: { kpis: { ok: true } } } },
      created_at: "2026-05-19T00:00:00Z",
    };
    expect(extractAdsenseMetricsFromRow(row)).toBeNull();
  });

  it("currency 누락 → KRW fallback", () => {
    const row = rowWithKpis({ earnings_today: 10, impressions: 100 });
    const m = extractAdsenseMetricsFromRow(row);
    expect(m!.currency).toBe("KRW");
  });
});
