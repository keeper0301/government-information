// ============================================================
// AdSense 매출 추세 단위 테스트
// ============================================================

import { describe, it, expect } from "vitest";
import { formatRevenueTrend, type RevenueTrend } from "@/lib/monitoring/adsense-revenue-trend";

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
