// ============================================================
// Site-resident agent cycle
// ============================================================
// Vercel cron can not keep a long-running Codex process alive, so this
// deterministic resident loop keeps the site operating even when the external
// sidecar is cold: diagnose, classify next actions, and audit every decision.
// ============================================================

import { logAdminAction } from "@/lib/admin-actions";
import {
  decideAgentAutomation,
  type AgentOperation,
  type AgentPolicyDecision,
} from "@/lib/autonomous-ops/agent-policy";
import {
  listDiagnoseQuestions,
  runDiagnose,
  type DiagnoseQuestion,
  type DiagnoseResult,
} from "@/lib/agent/diagnose";

export type ResidentAgentRecommendation = {
  operation: AgentOperation;
  decision: AgentPolicyDecision;
  evidence: string;
};

export type ResidentAgentCycleResult = {
  ok: true;
  startedAt: string;
  finishedAt: string;
  diagnoseCount: number;
  recommendationCount: number;
  highestRisk: AgentPolicyDecision["risk"];
  recommendations: ResidentAgentRecommendation[];
};

const RISK_RANK: Record<AgentPolicyDecision["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export async function runResidentAgentCycle(
  questions: DiagnoseQuestion[] = listDiagnoseQuestions(),
): Promise<ResidentAgentCycleResult> {
  const startedAt = new Date().toISOString();
  const diagnoseResults = await Promise.all(
    questions.map(async (question) => {
      const result = await runDiagnose(question);
      await auditDiagnose(result);
      return result;
    }),
  );

  const recommendations = buildResidentRecommendations(diagnoseResults).map(
    ({ operation, evidence }) => ({
      operation,
      evidence,
      decision: decideAgentAutomation(operation),
    }),
  );

  for (const rec of recommendations) {
    await auditRecommendation(rec);
  }

  return {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    diagnoseCount: diagnoseResults.length,
    recommendationCount: recommendations.length,
    highestRisk: highestRisk(recommendations),
    recommendations,
  };
}

function buildResidentRecommendations(
  results: DiagnoseResult[],
): { operation: AgentOperation; evidence: string }[] {
  const recs: { operation: AgentOperation; evidence: string }[] = [
    {
      operation: { area: "agent_call", action: "codex_diagnose" },
      evidence: `resident cycle collected ${results.length} diagnose snapshots`,
    },
  ];

  const health = findData(results, "health_overview") as {
    cron_failures_24h?: number;
    health_alert_runs_24h?: number;
  } | null;
  if ((health?.cron_failures_24h ?? 0) > 0) {
    recs.push({
      operation: { area: "site_ops", action: "cron_audit" },
      evidence: `cron failures in 24h: ${health?.cron_failures_24h}`,
    });
  }
  if ((health?.health_alert_runs_24h ?? 0) === 0) {
    recs.push({
      operation: { area: "agent_call", action: "codex_cron_fix" },
      evidence: "health-alert audit missing in the last 24h",
    });
  }

  const blog = findData(results, "blog_publish_status") as {
    status?: string;
    published24h?: number;
    bodyStatus?: string;
  } | null;
  if (blog?.status && blog.status !== "healthy") {
    recs.push({
      operation: { area: "agent_call", action: "codex_blog_publish_fix" },
      evidence: `blog publish status: ${blog.status}`,
    });
  }
  if (typeof blog?.published24h === "number" && blog.published24h === 0) {
    recs.push({
      operation: { area: "agent_call", action: "codex_blog_publish_fix" },
      evidence: "blog published24h is 0",
    });
  }
  if (blog?.bodyStatus === "anomaly") {
    recs.push({
      operation: { area: "agent_call", action: "codex_prompt_tuning" },
      evidence: "blog body length anomaly detected",
    });
  }

  const press = findData(results, "press_tier_status") as {
    mid_pending?: number;
    low_pending?: number;
  } | null;
  if ((press?.mid_pending ?? 0) >= 10 || (press?.low_pending ?? 0) >= 20) {
    recs.push({
      operation: { area: "agent_call", action: "codex_scraper_fix" },
      evidence: `press queue mid=${press?.mid_pending ?? 0}, low=${press?.low_pending ?? 0}`,
    });
  }

  const sms = findData(results, "sms_delivery_24h");
  if (Array.isArray(sms) && sms.length === 0) {
    recs.push({
      operation: { area: "agent_call", action: "codex_notification_fix" },
      evidence: "no SMS/telegram delivery audit in the last 24h",
    });
  }

  return dedupeRecommendations(recs);
}

function findData(results: DiagnoseResult[], question: DiagnoseQuestion): unknown {
  return results.find((r) => r.question === question)?.data ?? null;
}

function dedupeRecommendations(
  recs: { operation: AgentOperation; evidence: string }[],
): { operation: AgentOperation; evidence: string }[] {
  const seen = new Set<string>();
  return recs.filter((rec) => {
    const key = `${rec.operation.area}:${rec.operation.action}:${rec.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function highestRisk(
  recommendations: ResidentAgentRecommendation[],
): AgentPolicyDecision["risk"] {
  return recommendations.reduce<AgentPolicyDecision["risk"]>(
    (highest, rec) =>
      RISK_RANK[rec.decision.risk] > RISK_RANK[highest]
        ? rec.decision.risk
        : highest,
    "low",
  );
}

async function auditDiagnose(result: DiagnoseResult) {
  await logAdminAction({
    actorId: null,
    action: "agent_diagnose_run",
    details: {
      source: "site_resident_cron",
      question: result.question,
      collected_at: result.collected_at,
    },
  });
}

async function auditRecommendation(rec: ResidentAgentRecommendation) {
  await logAdminAction({
    actorId: null,
    action: "agent_execute_run",
    details: {
      source: "site_resident_cron",
      area: rec.operation.area,
      action: rec.operation.action,
      evidence: rec.evidence,
      decision_mode: rec.decision.mode,
      decision_risk: rec.decision.risk,
      decision_reason: rec.decision.reason,
      dispatched: false,
      resident_cycle: true,
    },
  });
}
