import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAdminAction: vi.fn(async () => undefined),
  diagnoseData: new Map<string, unknown>(),
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));

vi.mock("@/lib/agent/diagnose", () => ({
  listDiagnoseQuestions: () => [
    "health_overview",
    "blog_publish_status",
    "press_tier_status",
    "sms_delivery_24h",
  ],
  runDiagnose: async (question: string) => ({
    question,
    data: mocks.diagnoseData.get(question) ?? {},
    collected_at: "2026-05-19T00:00:00.000Z",
  }),
}));

import { runResidentAgentCycle } from "@/lib/agent/resident-cycle";

describe("runResidentAgentCycle", () => {
  beforeEach(() => {
    mocks.logAdminAction.mockClear();
    mocks.diagnoseData.clear();
    mocks.diagnoseData.set("health_overview", {
      cron_failures_24h: 0,
      health_alert_runs_24h: 1,
    });
    mocks.diagnoseData.set("blog_publish_status", {
      status: "healthy",
      published24h: 1,
    });
    mocks.diagnoseData.set("press_tier_status", {
      mid_pending: 0,
      low_pending: 0,
    });
    mocks.diagnoseData.set("sms_delivery_24h", [{ sms_ok: true }]);
  });

  it("audits every diagnostic and baseline resident decision", async () => {
    const result = await runResidentAgentCycle();

    expect(result.diagnoseCount).toBe(4);
    expect(result.recommendationCount).toBe(1);
    expect(result.recommendations[0].operation.action).toBe("codex_diagnose");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_diagnose_run",
        details: expect.objectContaining({
          source: "site_resident_cron",
          question: "health_overview",
        }),
      }),
    );
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_execute_run",
        details: expect.objectContaining({
          source: "site_resident_cron",
          action: "codex_diagnose",
          decision_mode: "auto_execute",
          dispatched: false,
          resident_cycle: true,
        }),
      }),
    );
  });

  it("queues PR-class fixes when diagnostics show publish or cron problems", async () => {
    mocks.diagnoseData.set("health_overview", {
      cron_failures_24h: 2,
      health_alert_runs_24h: 0,
    });
    mocks.diagnoseData.set("blog_publish_status", {
      status: "anomaly",
      published24h: 0,
      bodyStatus: "anomaly",
    });

    const result = await runResidentAgentCycle();

    const actions = result.recommendations.map((r) => r.operation.action);
    expect(actions).toContain("cron_audit");
    expect(actions).toContain("codex_cron_fix");
    expect(actions).toContain("codex_blog_publish_fix");
    expect(actions).toContain("codex_prompt_tuning");
    expect(result.highestRisk).toBe("medium");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_execute_run",
        details: expect.objectContaining({
          action: "codex_blog_publish_fix",
          decision_mode: "create_pr",
          decision_risk: "medium",
        }),
      }),
    );
  });
});
