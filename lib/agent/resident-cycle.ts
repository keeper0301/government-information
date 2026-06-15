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

export type ResidentAgentSource =
  | "site_resident_cron"
  | "github_actions_heartbeat"
  | "server_resident_startup"
  | "server_resident_worker"
  | "server_resident_manual";

export type ResidentAgentCycleOptions = {
  questions?: DiagnoseQuestion[];
  source?: ResidentAgentSource;
};

export type ResidentAgentCycleResult = {
  ok: true;
  startedAt: string;
  finishedAt: string;
  source: ResidentAgentSource;
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

const PRESS_MID_PR_THRESHOLD = 10;
const PRESS_LOW_MONITOR_THRESHOLD = 30;
const PRESS_LOW_PR_THRESHOLD = 70;

export async function runResidentAgentCycle(
  input: DiagnoseQuestion[] | ResidentAgentCycleOptions = {},
): Promise<ResidentAgentCycleResult> {
  const options = Array.isArray(input) ? { questions: input } : input;
  const source = options.source ?? "site_resident_cron";
  const questions = options.questions ?? listDiagnoseQuestions();
  const startedAt = new Date().toISOString();
  const diagnoseResults = await Promise.all(
    questions.map(async (question) => {
      const result = await runDiagnose(question);
      await auditDiagnose(result, source);
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
    await auditRecommendation(rec, source);
  }

  return {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    source,
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
    stale_low_pending_14d?: number;
    low_cleanup_runs_7d?: number;
  } | null;
  const pressEvidence = [
    `mid=${press?.mid_pending ?? 0}`,
    `low=${press?.low_pending ?? 0}`,
    `stale_low_14d=${press?.stale_low_pending_14d ?? 0}`,
    `cleanup7d=${press?.low_cleanup_runs_7d ?? 0}`,
  ].join(", ");
  const midNeedsPr = (press?.mid_pending ?? 0) >= PRESS_MID_PR_THRESHOLD;
  const staleLowNeedsPr = (press?.stale_low_pending_14d ?? 0) > 0;
  const lowNeedsPr = (press?.low_pending ?? 0) >= PRESS_LOW_PR_THRESHOLD;

  if (midNeedsPr || staleLowNeedsPr || lowNeedsPr) {
    recs.push({
      operation: { area: "agent_call", action: "codex_scraper_fix" },
      evidence: `press queue ${pressEvidence}`,
    });
  } else if ((press?.low_pending ?? 0) >= PRESS_LOW_MONITOR_THRESHOLD) {
    recs.push({
      operation: { area: "site_ops", action: "cron_audit" },
      evidence: `press low backlog monitor only: ${pressEvidence}`,
    });
  }

  const sms = findData(results, "sms_delivery_24h");
  if (Array.isArray(sms) && sms.length === 0) {
    recs.push({
      operation: { area: "agent_call", action: "codex_notification_fix" },
      evidence: "no SMS/telegram delivery audit in the last 24h",
    });
  }

  // 자가치유 감지 확장 — 23 GHA collector 고장 시 수리 제안 생성(W0 audit only).
  // local_press_collector_health 진단(읽기전용)의 문제 collector 를 evidence 로.
  const collectorHealth = findData(
    results,
    "local_press_collector_health",
  ) as {
    problem_count?: number;
    problems?: { city?: string; status?: string }[];
  } | null;
  if ((collectorHealth?.problem_count ?? 0) > 0) {
    const cities = (collectorHealth?.problems ?? [])
      .slice(0, 5)
      .map((p) => `${p.city ?? "?"}(${p.status ?? "?"})`)
      .join(", ");
    recs.push({
      operation: { area: "agent_call", action: "codex_scraper_fix" },
      evidence: `local-press collector 고장 ${collectorHealth?.problem_count}건: ${cities}`,
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

async function auditDiagnose(
  result: DiagnoseResult,
  source: ResidentAgentSource,
) {
  await logAdminAction({
    actorId: null,
    action: "agent_diagnose_run",
    details: {
      source,
      question: result.question,
      collected_at: result.collected_at,
    },
  });
}

async function auditRecommendation(
  rec: ResidentAgentRecommendation,
  source: ResidentAgentSource,
) {
  await logAdminAction({
    actorId: null,
    action: "agent_execute_run",
    details: {
      source,
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
