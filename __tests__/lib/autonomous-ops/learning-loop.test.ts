import { describe, expect, it } from "vitest";

import {
  buildLearningLoopSnapshotFromRows,
  type LearningLoopAdminActionRow,
} from "@/lib/autonomous-ops/learning-loop";
import { GEMINI_KEEPIOO_CAP_KRW } from "@/lib/analytics/gemini-spending";

const NOW = "2026-05-19T03:00:00.000Z";

function row(
  action: string,
  created_at: string,
  details: Record<string, unknown> | null,
): LearningLoopAdminActionRow {
  return { action, created_at, details };
}

describe("buildLearningLoopSnapshotFromRows", () => {
  it("builds source reliability, PR-ready candidates, and daily digest", () => {
    const snapshot = buildLearningLoopSnapshotFromRows({
      generatedAt: NOW,
      rows24h: [
        row("agent_diagnose_run", "2026-05-19T02:55:00.000Z", {
          source: "github_actions_heartbeat",
          question: "health_overview",
        }),
        row("agent_diagnose_run", "2026-05-19T02:50:00.000Z", {
          source: "server_resident_worker",
          question: "blog_publish_status",
        }),
        row("agent_execute_run", "2026-05-19T02:49:00.000Z", {
          source: "github_actions_heartbeat",
          action: "codex_blog_publish_fix",
          decision_mode: "create_pr",
          decision_risk: "medium",
          decision_reason: "blog publish body anomaly",
          evidence: "published24h=0",
        }),
      ],
      scanRows7d: [
        row("autonomous_improvement_scan_run", "2026-05-19T02:40:00.000Z", {
          recommendations: [
            {
              title: "Fix blog publish body anomaly",
              area: "content",
              severity: "medium",
              evidence: "body status anomaly",
              action: "create parser fix PR",
            },
            {
              title: "Review failed cron cluster",
              area: "cron",
              severity: "high",
              evidence: "3 cron failures",
              action: "manual review before retry",
            },
          ],
        }),
      ],
      spending: {
        windowDays: 28,
        totalCalls: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostKrw: 1200,
        monthlyProjectionKrw: 1500,
      },
    });

    expect(snapshot.generatedAt).toBe(NOW);
    expect(snapshot.agentRuns24h).toBe(2);
    expect(snapshot.agentDecisions24h).toBe(1);
    expect(snapshot.automationReliability.targetRuns24h).toBe(288);
    expect(snapshot.automationReliability.status).toBe("cold");
    expect(snapshot.sourceStats24h).toEqual([
      {
        source: "github_actions_heartbeat",
        diagnoseRuns: 1,
        executeRuns: 1,
        lastSeenAt: "2026-05-19T02:55:00.000Z",
      },
      {
        source: "server_resident_worker",
        diagnoseRuns: 1,
        executeRuns: 0,
        lastSeenAt: "2026-05-19T02:50:00.000Z",
      },
    ]);
    expect(snapshot.prReadyCount).toBe(2);
    expect(snapshot.adminReviewCount).toBe(1);
    expect(snapshot.digest.generatedAt).toBe(NOW);
    expect(snapshot.digest.nextActions[0]).toContain("GitHub PR");
  });

  it("flags high spend and blocks destructive suggestions", () => {
    const snapshot = buildLearningLoopSnapshotFromRows({
      generatedAt: NOW,
      rows24h: [],
      scanRows7d: [
        row("autonomous_improvement_scan_run", "2026-05-19T02:40:00.000Z", {
          recommendations: [
            {
              title: "Delete stale production rows",
              area: "database",
              severity: "low",
              evidence: "cleanup request",
              action: "delete production rows",
            },
          ],
        }),
      ],
      spending: {
        windowDays: 28,
        totalCalls: 100,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostKrw: GEMINI_KEEPIOO_CAP_KRW,
        monthlyProjectionKrw: GEMINI_KEEPIOO_CAP_KRW,
      },
    });

    expect(snapshot.blockedCount).toBe(1);
    expect(snapshot.cost.capRatio).toBe(1);
    expect(snapshot.cost.recommendation).toContain("Reduce content generation cadence");
    expect(snapshot.digest.risks).toContain("LLM monthly projection is above 80% of cap.");
    expect(snapshot.healthScore).toBeLessThan(50);
  });
});
