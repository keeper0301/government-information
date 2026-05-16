// ============================================================
// supabase buildSupabaseAlerts 단위 테스트
// ============================================================
// project status + advisor (WARN / ERROR) 임계 분기 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildSupabaseAlerts,
  type SupabaseProject,
} from "@/lib/external-console/supabase";

const project = (status: string, name = "keepioo-prod"): SupabaseProject => ({
  id: "abc123",
  name,
  status: status as SupabaseProject["status"],
  region: "ap-northeast-2",
});

describe("buildSupabaseAlerts", () => {
  it("ACTIVE_HEALTHY + advisor 0 → alert 없음", () => {
    const out = buildSupabaseAlerts({
      project: project("ACTIVE_HEALTHY"),
      advisorWarn: 0,
      advisorError: 0,
    });
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.project_status).toBe("ACTIVE_HEALTHY");
  });

  it("status PAUSED → supabase_project_unhealthy alert", () => {
    const out = buildSupabaseAlerts({
      project: project("PAUSED"),
      advisorWarn: 0,
      advisorError: 0,
    });
    expect(out.alerts.find((a) => a.key === "supabase_project_unhealthy")).toBeDefined();
  });

  it("advisor ERROR 1+ → supabase_advisor_error alert (즉시 보안)", () => {
    const out = buildSupabaseAlerts({
      project: project("ACTIVE_HEALTHY"),
      advisorWarn: 0,
      advisorError: 1,
    });
    expect(out.alerts.find((a) => a.key === "supabase_advisor_error")).toBeDefined();
  });

  it("advisor WARN 5+ → supabase_advisor_warn alert", () => {
    const out = buildSupabaseAlerts({
      project: project("ACTIVE_HEALTHY"),
      advisorWarn: 5,
      advisorError: 0,
    });
    expect(out.alerts.find((a) => a.key === "supabase_advisor_warn")).toBeDefined();
  });

  it("advisor WARN < 5 → warn alert 안 함", () => {
    const out = buildSupabaseAlerts({
      project: project("ACTIVE_HEALTHY"),
      advisorWarn: 4,
      advisorError: 0,
    });
    expect(out.alerts.find((a) => a.key === "supabase_advisor_warn")).toBeUndefined();
  });

  it("status 누락 → UNKNOWN 분기 → alert", () => {
    const out = buildSupabaseAlerts({
      project: {},
      advisorWarn: 0,
      advisorError: 0,
    });
    expect(out.kpis.project_status).toBe("UNKNOWN");
    expect(out.alerts[0].key).toBe("supabase_project_unhealthy");
  });
});
