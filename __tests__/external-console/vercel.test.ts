// ============================================================
// vercel buildVercelAlerts 단위 테스트
// ============================================================
// 최근 prod 배포 실패 + 24h 실패율 임계 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildVercelAlerts,
  type DeploymentRow,
} from "@/lib/external-console/vercel";

const NOW = Date.now();
const dep = (state: string, ageMs = 0, uid = `d${Math.random().toString(36).slice(2, 8)}`): DeploymentRow => ({
  uid,
  state,
  createdAt: NOW - ageMs,
  target: "production",
});

describe("buildVercelAlerts", () => {
  it("0건 → info kpi, alert 없음", () => {
    const out = buildVercelAlerts([]);
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.total_24h).toBe(0);
    expect(out.kpis.info).toContain("배포 없음");
  });

  it("최근 prod 배포 READY → alert 없음", () => {
    const out = buildVercelAlerts([dep("READY", 1000), dep("READY", 2 * 3600_000)]);
    expect(out.alerts).toHaveLength(0);
  });

  it("최근 prod 배포 ERROR → vercel_last_deploy_failed", () => {
    const out = buildVercelAlerts([dep("ERROR", 1000), dep("READY", 2 * 3600_000)]);
    expect(out.alerts.find((a) => a.key === "vercel_last_deploy_failed")).toBeDefined();
  });

  it("24h 실패율 ≥30% + 표본 3+ → vercel_24h_high_failure", () => {
    // 4건 중 2건 실패 (50%) → 임계 충족
    const out = buildVercelAlerts([
      dep("ERROR", 1 * 3600_000),
      dep("ERROR", 2 * 3600_000),
      dep("READY", 3 * 3600_000),
      dep("READY", 4 * 3600_000),
    ]);
    const high = out.alerts.find((a) => a.key === "vercel_24h_high_failure");
    expect(high).toBeDefined();
    expect(high?.message).toContain("50%");
  });

  it("표본 < 3 → vercel_24h_high_failure alert 안 함 (noisy 방지)", () => {
    // 2건 중 1건 실패 (50%) — 표본 부족
    const out = buildVercelAlerts([
      dep("ERROR", 1 * 3600_000),
      dep("READY", 2 * 3600_000),
    ]);
    expect(out.alerts.find((a) => a.key === "vercel_24h_high_failure")).toBeUndefined();
  });

  it("BUILDING/QUEUED 진행중 → decided24h 집계 제외", () => {
    const out = buildVercelAlerts([
      dep("BUILDING", 1 * 3600_000),
      dep("READY", 2 * 3600_000),
      dep("READY", 3 * 3600_000),
    ]);
    expect(out.alerts).toHaveLength(0);
  });
});
