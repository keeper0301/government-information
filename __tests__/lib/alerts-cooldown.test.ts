import { describe, expect, it } from "vitest";
import { filterAlertsByCooldown } from "@/lib/alerts/cooldown";
import type { ThresholdAlert } from "@/lib/health-check";

const mkAlert = (key: ThresholdAlert["key"]): ThresholdAlert => ({
  key,
  message: `test ${key}`,
});

describe("filterAlertsByCooldown — SMS noise 차단", () => {
  it("empty firedKeys → 모든 alert 가 smsAlerts (cooldown 비활성 케이스)", () => {
    const alerts = [mkAlert("low_activity"), mkAlert("policy_inflow_zero")];
    const { smsAlerts, suppressedKeys } = filterAlertsByCooldown(
      alerts,
      new Set(),
    );
    expect(smsAlerts).toHaveLength(2);
    expect(suppressedKeys).toEqual([]);
  });

  it("firedKeys 에 1개 있으면 그것만 suppress, 나머지는 SMS", () => {
    const alerts = [
      mkAlert("policy_inflow_zero"),
      mkAlert("press_pending"),
      mkAlert("enrich_stuck"),
    ];
    const fired = new Set<string>(["policy_inflow_zero"]);
    const { smsAlerts, suppressedKeys } = filterAlertsByCooldown(alerts, fired);
    expect(smsAlerts.map((a) => a.key)).toEqual([
      "press_pending",
      "enrich_stuck",
    ]);
    expect(suppressedKeys).toEqual(["policy_inflow_zero"]);
  });

  it("모든 alert 가 firedKeys 에 있으면 smsAlerts 빈 배열", () => {
    const alerts = [mkAlert("low_activity"), mkAlert("payment_fail")];
    const fired = new Set<string>(["low_activity", "payment_fail"]);
    const { smsAlerts, suppressedKeys } = filterAlertsByCooldown(alerts, fired);
    expect(smsAlerts).toEqual([]);
    expect(suppressedKeys).toEqual(["low_activity", "payment_fail"]);
  });

  it("alerts 비어 있으면 smsAlerts·suppressedKeys 모두 빈 배열", () => {
    const { smsAlerts, suppressedKeys } = filterAlertsByCooldown(
      [],
      new Set(["x"]),
    );
    expect(smsAlerts).toEqual([]);
    expect(suppressedKeys).toEqual([]);
  });
});
