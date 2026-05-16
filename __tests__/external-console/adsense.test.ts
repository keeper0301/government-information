// ============================================================
// AdSense buildAdsenseAlerts 단위 테스트
// ============================================================
// pure function — 사장님 보고 메시지 + alert key 회귀 방지.
// 2026-05-16 currency KRW + state=DISABLED + zero_revenue 분기 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import { buildAdsenseAlerts } from "@/lib/external-console/adsense";

describe("buildAdsenseAlerts", () => {
  it("READY + 수익 > 0 → alert 없음", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890", state: "READY" },
      earningsToday: 1234,
      currency: "KRW",
    });
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.account_state).toBe("READY");
    expect(out.kpis.earnings_today).toBe(1234);
    expect(out.kpis.currency).toBe("KRW");
  });

  it("READY + 수익 0 → adsense_zero_revenue alert + KRW 메시지", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890", state: "READY" },
      earningsToday: 0,
      currency: "KRW",
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("adsense_zero_revenue");
    expect(out.alerts[0].message).toContain("KRW 0");
  });

  it("state=DISABLED → adsense_account_state alert (READY 아니면 zero_revenue skip)", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890", state: "DISABLED" },
      earningsToday: 0,
      currency: "KRW",
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("adsense_account_state");
    expect(out.alerts[0].message).toContain("DISABLED");
    // READY 아니면 zero_revenue 두 번째 alert 안 함 (의미 X — 정지 상태에서 수익 0 당연)
    expect(out.alerts.find((a) => a.key === "adsense_zero_revenue")).toBeUndefined();
  });

  it("state=NEEDS_ATTENTION → adsense_account_state alert", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890", state: "NEEDS_ATTENTION" },
      earningsToday: 0,
      currency: "KRW",
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("adsense_account_state");
    expect(out.alerts[0].message).toContain("NEEDS_ATTENTION");
  });

  it("state 누락 → UNKNOWN 으로 alert", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890" },
      earningsToday: 0,
      currency: "KRW",
    });
    expect(out.alerts[0].key).toBe("adsense_account_state");
    expect(out.alerts[0].message).toContain("UNKNOWN");
    expect(out.kpis.account_state).toBe("UNKNOWN");
  });

  it("currency USD override (다른 국가 운영 case)", () => {
    const out = buildAdsenseAlerts({
      account: { name: "accounts/pub-1234567890", state: "READY" },
      earningsToday: 0,
      currency: "USD",
    });
    expect(out.alerts[0].message).toContain("USD 0");
    expect(out.kpis.currency).toBe("USD");
  });
});
