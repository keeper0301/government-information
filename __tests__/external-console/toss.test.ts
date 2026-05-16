// ============================================================
// toss buildTossAlerts 단위 테스트
// ============================================================
// TOSS_SECRET_KEY 미설정 → info-only (alert X) 검증.
// 24h 해지율 10%+ → toss_high_churn alert 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import { buildTossAlerts } from "@/lib/external-console/toss";

describe("buildTossAlerts", () => {
  it("TOSS_SECRET_KEY 미설정 → alert 없음 + info kpi", () => {
    const out = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 0, active_total: 0 },
      false,
    );
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.info).toContain("TOSS_SECRET_KEY 미설정");
  });

  it("활성 구독 0 → churn 계산 0 / alert 없음 (저트래픽)", () => {
    const out = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 0, active_total: 0 },
      true,
    );
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.churn_rate_24h).toBe(0);
  });

  it("해지율 10%+ → toss_high_churn alert", () => {
    // 활성 10 + 해지 2 = 20% — 임계 충족
    const out = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 2, active_total: 10 },
      true,
    );
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("toss_high_churn");
    expect(out.alerts[0].message).toContain("20%");
    expect(out.kpis.churn_rate_24h).toBe(0.2);
  });

  it("해지율 10% 미만 → alert 없음", () => {
    // 활성 100 + 해지 5 = 5%
    const out = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 5, active_total: 100 },
      true,
    );
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.churn_rate_24h).toBe(0.05);
  });

  it("활성 0 + 해지 1 → alert 안 함 (division by zero 안전)", () => {
    const out = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 1, active_total: 0 },
      true,
    );
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.churn_rate_24h).toBe(0);
  });
});
