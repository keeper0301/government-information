import { describe, expect, it } from "vitest";
import { buildKakaoAlerts, type SolapiMessageRow } from "@/lib/external-console/kakao";
import { buildTossAlerts } from "@/lib/external-console/toss";

// ─── 카카오 (Solapi) ───────────────────────────────────────
describe("buildKakaoAlerts", () => {
  const ok = (n: number): SolapiMessageRow[] =>
    Array.from({ length: n }, () => ({ statusCode: "2000", type: "ATA" }));
  const failed = (n: number, code = "4001"): SolapiMessageRow[] =>
    Array.from({ length: n }, () => ({ statusCode: code, type: "ATA" }));
  const pending = (n: number): SolapiMessageRow[] =>
    Array.from({ length: n }, () => ({ statusCode: "1000", type: "ATA" }));

  it("발송 0건 → alert 0 (자연 0 — cron 휴면 시간 정상)", () => {
    const { alerts, kpis } = buildKakaoAlerts([]);
    expect(alerts).toHaveLength(0);
    expect(kpis.total_24h).toBe(0);
  });

  it("모두 성공 (10건) → alert 0", () => {
    const { alerts, kpis } = buildKakaoAlerts(ok(10));
    expect(alerts).toHaveLength(0);
    expect(kpis.success_24h).toBe(10);
    expect(kpis.failure_rate).toBe(0);
  });

  it("실패율 10% (10건 중 1건) → kakao_high_failure alert", () => {
    const { alerts, kpis } = buildKakaoAlerts([...ok(9), ...failed(1)]);
    const a = alerts.find((x) => x.key === "kakao_high_failure");
    expect(a).toBeDefined();
    expect(a?.message).toContain("10%");
    expect(a?.recommendation).toContain("Solapi 콘솔");
    expect(kpis.failed_24h).toBe(1);
  });

  it("실패율 9% (10건 중 0.9 = 0) → alert 안 발송", () => {
    // 정확히 100건 중 9건 실패 = 9% (임계 미만)
    const { alerts } = buildKakaoAlerts([...ok(91), ...failed(9)]);
    expect(alerts.find((a) => a.key === "kakao_high_failure")).toBeUndefined();
  });

  it("총 5건 미만 + 실패 1건 → alert 안 발송 (small sample 보호)", () => {
    const { alerts } = buildKakaoAlerts([...ok(2), ...failed(1)]);
    expect(alerts.find((a) => a.key === "kakao_high_failure")).toBeUndefined();
  });

  it("pending 10건 → kakao_pending_stuck alert", () => {
    const { alerts } = buildKakaoAlerts(pending(10));
    const a = alerts.find((x) => x.key === "kakao_pending_stuck");
    expect(a).toBeDefined();
  });

  it("pending 9건 → alert 안 발송 (정확 경계)", () => {
    const { alerts } = buildKakaoAlerts(pending(9));
    expect(alerts.find((a) => a.key === "kakao_pending_stuck")).toBeUndefined();
  });

  it("실패 코드 분포 KPI 에 포함", () => {
    const { kpis } = buildKakaoAlerts([
      ...failed(3, "4001"),
      ...failed(2, "4002"),
    ]);
    expect(kpis.failed_codes).toEqual({ "4001": 3, "4002": 2 });
  });
});

// ─── 토스 ────────────────────────────────────────────────
describe("buildTossAlerts", () => {
  it("TOSS_SECRET_KEY 미설정 → alert 0 + info kpi", () => {
    const { alerts, kpis } = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 0, active_total: 0 },
      false,
    );
    expect(alerts).toHaveLength(0);
    expect(kpis.info).toContain("미설정");
  });

  it("정상 (해지 0) → alert 0", () => {
    const { alerts, kpis } = buildTossAlerts(
      { new_active_24h: 1, cancelled_24h: 0, active_total: 10 },
      true,
    );
    expect(alerts).toHaveLength(0);
    expect(kpis.churn_rate_24h).toBe(0);
  });

  it("24h 해지 ≥ 활성 10% → toss_high_churn alert", () => {
    const { alerts } = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 2, active_total: 10 },
      true,
    );
    const a = alerts.find((x) => x.key === "toss_high_churn");
    expect(a).toBeDefined();
    expect(a?.message).toContain("20%");
  });

  it("24h 해지 ≥ 1 + 활성 0 → alert 안 발송 (분모 0 가드)", () => {
    const { alerts } = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 1, active_total: 0 },
      true,
    );
    expect(alerts.find((a) => a.key === "toss_high_churn")).toBeUndefined();
  });

  it("churn_rate KPI 정확", () => {
    const { kpis } = buildTossAlerts(
      { new_active_24h: 0, cancelled_24h: 1, active_total: 100 },
      true,
    );
    expect(kpis.churn_rate_24h).toBe(0.01);
  });
});
