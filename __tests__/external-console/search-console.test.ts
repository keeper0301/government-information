// ============================================================
// search-console buildSearchConsoleAlerts 단위 테스트
// ============================================================
// 클릭 0 (색인·robots·도메인) + 저 CTR (제목/meta 매력 저하) 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import { buildSearchConsoleAlerts } from "@/lib/external-console/search-console";

describe("buildSearchConsoleAlerts", () => {
  it("클릭 > 0 + CTR 정상 → alert 없음", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 50,
      impressions: 1000,
      ctr: 0.05,
      position: 8.5,
    });
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.clicks).toBe(50);
  });

  it("클릭 0 → sc_no_clicks alert", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 0,
      impressions: 100,
      ctr: 0,
      position: 50,
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("sc_no_clicks");
    expect(out.alerts[0].message).toContain("노출 100");
  });

  it("저 CTR (< 0.5%) + 노출 충분 → sc_low_ctr alert", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 2,
      impressions: 1000, // LOW_CTR_MIN_IMPRESSIONS 충족 가정
      ctr: 0.002, // 0.2%
      position: 20,
    });
    const lowCtr = out.alerts.find((a) => a.key === "sc_low_ctr");
    expect(lowCtr).toBeDefined();
    expect(lowCtr?.message).toContain("0.20%");
  });

  it("저 CTR 인데 노출 부족 → sc_low_ctr alert 안 함 (noisy 방지)", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 0,
      impressions: 5,
      ctr: 0,
      position: 50,
    });
    expect(out.alerts.find((a) => a.key === "sc_low_ctr")).toBeUndefined();
    // 클릭 0 alert 는 별개로 떠야 함
    expect(out.alerts.find((a) => a.key === "sc_no_clicks")).toBeDefined();
  });

  it("kpis 반올림 — ctr 4자리 / position 2자리", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 12,
      impressions: 567,
      ctr: 0.0211676,
      position: 14.6789,
    });
    expect(out.kpis.ctr).toBe(0.0212);
    expect(out.kpis.avg_position).toBe(14.68);
  });
});
