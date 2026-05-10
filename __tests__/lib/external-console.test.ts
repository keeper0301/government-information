import { describe, expect, it } from "vitest";
import { buildKakaoAlerts, type SolapiMessageRow } from "@/lib/external-console/kakao";
import { buildTossAlerts } from "@/lib/external-console/toss";
import {
  buildVercelAlerts,
  type DeploymentRow,
} from "@/lib/external-console/vercel";
import { buildSupabaseAlerts } from "@/lib/external-console/supabase";

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

// ─── Vercel ──────────────────────────────────────────────
describe("buildVercelAlerts", () => {
  // 24h 안 (now - 1h) — 진행중·실패·성공 모두 24h 집계 대상
  const recent = (state: string, offsetMinAgo = 60): DeploymentRow => ({
    uid: `dpl_${state}_${offsetMinAgo}`,
    state,
    createdAt: Date.now() - offsetMinAgo * 60_000,
  });
  // 24h 이전 (now - 26h) — 24h 집계에서 빠짐. 최근 row 판정에는 영향
  const old = (state: string): DeploymentRow => ({
    uid: `dpl_old_${state}`,
    state,
    createdAt: Date.now() - 26 * 3600_000,
  });

  it("배포 0건 → alert 0 (push 없는 날 정상)", () => {
    const { alerts, kpis } = buildVercelAlerts([]);
    expect(alerts).toHaveLength(0);
    expect(kpis.total_24h).toBe(0);
    expect(kpis.latest_state).toBe(null);
  });

  it("최근 prod 배포 ERROR → vercel_last_deploy_failed alert", () => {
    const { alerts, kpis } = buildVercelAlerts([recent("ERROR", 30)]);
    const a = alerts.find((x) => x.key === "vercel_last_deploy_failed");
    expect(a).toBeDefined();
    expect(a?.message).toContain("ERROR");
    expect(kpis.latest_state).toBe("ERROR");
    expect(kpis.failed_24h).toBe(1);
  });

  it("최근 prod 배포 READY → alert 0", () => {
    const { alerts, kpis } = buildVercelAlerts([recent("READY", 30)]);
    expect(alerts).toHaveLength(0);
    expect(kpis.failure_rate).toBe(0);
  });

  it("진행중 (BUILDING) 은 실패 집계 제외", () => {
    const { alerts, kpis } = buildVercelAlerts([recent("BUILDING", 5)]);
    expect(alerts).toHaveLength(0);
    expect(kpis.total_24h).toBe(0); // decided 만 집계
  });

  it("24h 실패율 100% (3건) → vercel_24h_high_failure alert", () => {
    const { alerts } = buildVercelAlerts([
      recent("ERROR", 60),
      recent("ERROR", 120),
      recent("ERROR", 180),
    ]);
    const a = alerts.find((x) => x.key === "vercel_24h_high_failure");
    expect(a).toBeDefined();
    expect(a?.message).toContain("100%");
  });

  it("24h 실패율 33% (3건 중 1건) → 임계 30% 초과 alert", () => {
    const { alerts } = buildVercelAlerts([
      recent("READY", 60),
      recent("READY", 120),
      recent("ERROR", 180),
    ]);
    const a = alerts.find((x) => x.key === "vercel_24h_high_failure");
    expect(a).toBeDefined();
  });

  it("24h 실패율 50% 인데 표본 2건 → 표본 부족으로 alert 안 함", () => {
    const { alerts } = buildVercelAlerts([
      recent("READY", 60),
      recent("ERROR", 120),
    ]);
    expect(
      alerts.find((a) => a.key === "vercel_24h_high_failure"),
    ).toBeUndefined();
  });

  it("24h 이전 ERROR 는 집계 제외 (최근 row 가 ERROR 면 last_deploy_failed 만)", () => {
    const { alerts, kpis } = buildVercelAlerts([
      recent("ERROR", 60),
      old("ERROR"),
      old("ERROR"),
    ]);
    expect(kpis.total_24h).toBe(1); // 24h 안 1건만
    expect(alerts.find((a) => a.key === "vercel_last_deploy_failed")).toBeDefined();
    expect(
      alerts.find((a) => a.key === "vercel_24h_high_failure"),
    ).toBeUndefined();
  });
});

// ─── Supabase ────────────────────────────────────────────
describe("buildSupabaseAlerts", () => {
  const healthy = { status: "ACTIVE_HEALTHY", name: "keepioo", region: "ap-northeast-2" };

  it("ACTIVE_HEALTHY + WARN 0 → alert 0", () => {
    const { alerts, kpis } = buildSupabaseAlerts({
      project: healthy,
      advisorWarn: 0,
      advisorError: 0,
    });
    expect(alerts).toHaveLength(0);
    expect(kpis.project_status).toBe("ACTIVE_HEALTHY");
  });

  it("PAUSED → supabase_project_unhealthy alert (Free tier 휴면 가능성 안내)", () => {
    const { alerts } = buildSupabaseAlerts({
      project: { ...healthy, status: "INACTIVE" },
      advisorWarn: 0,
      advisorError: 0,
    });
    const a = alerts.find((x) => x.key === "supabase_project_unhealthy");
    expect(a).toBeDefined();
    expect(a?.message).toContain("INACTIVE");
  });

  it("WARN 5건 → supabase_advisor_warn alert (임계)", () => {
    const { alerts } = buildSupabaseAlerts({
      project: healthy,
      advisorWarn: 5,
      advisorError: 0,
    });
    expect(alerts.find((a) => a.key === "supabase_advisor_warn")).toBeDefined();
  });

  it("WARN 4건 → 임계 미만으로 alert 안 함", () => {
    const { alerts } = buildSupabaseAlerts({
      project: healthy,
      advisorWarn: 4,
      advisorError: 0,
    });
    expect(
      alerts.find((a) => a.key === "supabase_advisor_warn"),
    ).toBeUndefined();
  });

  it("ERROR 1건 → supabase_advisor_error alert (보안 위험 즉시)", () => {
    const { alerts } = buildSupabaseAlerts({
      project: healthy,
      advisorWarn: 0,
      advisorError: 1,
    });
    expect(alerts.find((a) => a.key === "supabase_advisor_error")).toBeDefined();
  });

  it("UNKNOWN 상태 → unhealthy alert (보수적 — ACTIVE_HEALTHY 아니면 모두 alert)", () => {
    const { alerts } = buildSupabaseAlerts({
      project: { ...healthy, status: "UNKNOWN" },
      advisorWarn: 0,
      advisorError: 0,
    });
    expect(
      alerts.find((a) => a.key === "supabase_project_unhealthy"),
    ).toBeDefined();
  });

  it("kpi 에 region·name 포함 (이메일·admin 페이지에서 활용)", () => {
    const { kpis } = buildSupabaseAlerts({
      project: healthy,
      advisorWarn: 2,
      advisorError: 0,
    });
    expect(kpis.project_name).toBe("keepioo");
    expect(kpis.project_region).toBe("ap-northeast-2");
    expect(kpis.advisor_warn).toBe(2);
  });
});
