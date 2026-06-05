// ============================================================
// ga4 buildGa4Alerts 단위 테스트
// ============================================================

import { describe, it, expect } from "vitest";
import { buildGa4Alerts, parseTotals } from "@/lib/external-console/ga4";

describe("buildGa4Alerts", () => {
  it("활성 사용자 > 0 + 정상 bounce → alert 없음", () => {
    const out = buildGa4Alerts({
      activeUsers: 100,
      sessions: 250,
      bounceRate: 0.45,
    });
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.active_users).toBe(100);
  });

  it("활성 사용자 0 → ga4_no_traffic alert", () => {
    const out = buildGa4Alerts({
      activeUsers: 0,
      sessions: 0,
      bounceRate: 0,
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("ga4_no_traffic");
  });

  it("이탈률 90%+ → ga4_high_bounce alert (사용자 있을 때만)", () => {
    const out = buildGa4Alerts({
      activeUsers: 50,
      sessions: 60,
      bounceRate: 0.95,
    });
    const high = out.alerts.find((a) => a.key === "ga4_high_bounce");
    expect(high).toBeDefined();
    expect(high?.message).toContain("95%");
  });

  it("사용자 0 + 이탈률 100% → no_traffic 만 (high_bounce skip)", () => {
    const out = buildGa4Alerts({
      activeUsers: 0,
      sessions: 0,
      bounceRate: 1,
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("ga4_no_traffic");
  });

  it("bounceRate 반올림 (3자리)", () => {
    const out = buildGa4Alerts({
      activeUsers: 10,
      sessions: 20,
      bounceRate: 0.4567892,
    });
    expect(out.kpis.bounce_rate).toBe(0.457);
  });
});

// 2026-06-06 — GA4 ga4_no_traffic 만성 오탐(0 반환)의 근본 원인 회귀 방어.
// GA4 Data API 는 차원 없는 report 에서 totals 를 metricAggregations 요청 시에만 채우고,
// 안 그러면 rows[0] 에 전체값을 둔다. parseTotals 가 totals 만 보면 항상 0 이 됐다.
describe("parseTotals", () => {
  it("totals 가 있으면 totals 우선 파싱", () => {
    const report = {
      totals: [{ metricValues: [{ value: "92" }, { value: "178" }, { value: "0.45" }] }],
      rows: [{ metricValues: [{ value: "1" }, { value: "1" }, { value: "0.1" }] }],
    };
    expect(parseTotals(report)).toEqual({
      activeUsers: 92,
      sessions: 178,
      bounceRate: 0.45,
    });
  });

  it("totals 가 없으면 rows[0] 로 fallback (차원 없는 report 의 전체값)", () => {
    const report = {
      rows: [{ metricValues: [{ value: "92" }, { value: "178" }, { value: "0.45" }] }],
    };
    expect(parseTotals(report)).toEqual({
      activeUsers: 92,
      sessions: 178,
      bounceRate: 0.45,
    });
  });

  it("totals·rows 둘 다 없으면 0 (사이트 진짜 무트래픽)", () => {
    expect(parseTotals({})).toEqual({
      activeUsers: 0,
      sessions: 0,
      bounceRate: 0,
    });
  });
});
