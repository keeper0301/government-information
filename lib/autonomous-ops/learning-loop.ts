import { createAdminClient } from "@/lib/supabase/admin";
import {
  getGeminiSpendingStats,
  GEMINI_KEEPIOO_CAP_KRW,
} from "@/lib/analytics/gemini-spending";

export type LearningLoopSourceStat = {
  source: string;
  diagnoseRuns: number;
  executeRuns: number;
  lastSeenAt: string | null;
};

export type LearningLoopDecisionStat = {
  mode: string;
  risk: string;
  count: number;
};

export type ImprovementCandidate = {
  key: string;
  title: string;
  area: string;
  severity: "high" | "medium" | "low";
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: string;
  action: string;
  lane: "auto_execute" | "auto_pr" | "admin_review" | "blocked";
};

export type LearningDigest = {
  periodHours: number;
  generatedAt: string;
  summary: string;
  wins: string[];
  risks: string[];
  nextActions: string[];
};

export type CostEffectivenessSnapshot = {
  windowDays: number;
  totalCostKrw: number;
  monthlyProjectionKrw: number;
  capKrw: number;
  capRatio: number;
  totalCalls: number;
  agentRuns24h: number;
  costPerAgentRunKrw: number | null;
  recommendation: string;
};

export type AutomationReliabilitySnapshot = {
  targetRuns24h: number;
  actualRuns24h: number;
  missingRuns: number;
  completionRatio: number;
  status: "healthy" | "watch" | "cold";
};

export type OperationalAnomaly = {
  key: string;
  title: string;
  area: string;
  severity: "critical" | "high" | "medium" | "low";
  evidence: string;
  recommendation: string;
  signal: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type LearningLoopSnapshot = {
  generatedAt: string;
  healthScore: number;
  agentRuns24h: number;
  agentDecisions24h: number;
  anomalyCount: number;
  criticalAnomalyCount: number;
  prReadyCount: number;
  autoExecutableCount: number;
  adminReviewCount: number;
  blockedCount: number;
  automationReliability: AutomationReliabilitySnapshot;
  anomalies: OperationalAnomaly[];
  sourceStats24h: LearningLoopSourceStat[];
  decisionStats24h: LearningLoopDecisionStat[];
  candidates: ImprovementCandidate[];
  digest: LearningDigest;
  cost: CostEffectivenessSnapshot;
};

export type LearningLoopAdminActionRow = {
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
};

type AdminActionRow = LearningLoopAdminActionRow;
type GeminiSpendingSnapshot = Awaited<ReturnType<typeof getGeminiSpendingStats>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const RESIDENT_HEARTBEAT_TARGET_24H = 288;
const SEVERITY_RANK: Record<ImprovementCandidate["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export async function getLearningLoopSnapshot(): Promise<LearningLoopSnapshot> {
  const [rows24h, scanRows7d, spending] = await Promise.all([
    fetchAdminActions(1),
    fetchImprovementScans(7),
    getGeminiSpendingStats(28).catch(() => null),
  ]);

  return buildLearningLoopSnapshotFromRows({
    rows24h,
    scanRows7d,
    spending,
  });
}

export function buildLearningLoopSnapshotFromRows(input: {
  rows24h: LearningLoopAdminActionRow[];
  scanRows7d: LearningLoopAdminActionRow[];
  spending: GeminiSpendingSnapshot | null;
  generatedAt?: string;
}): LearningLoopSnapshot {
  const rows24h = input.rows24h.map(normalizeRow);
  const scanRows7d = input.scanRows7d.map(normalizeRow);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceStats24h = buildSourceStats(rows24h);
  const decisionStats24h = buildDecisionStats(rows24h);
  const candidates = buildImprovementCandidates(scanRows7d, rows24h);
  const agentRuns24h = rows24h.filter((r) => r.action === "agent_diagnose_run").length;
  const agentDecisions24h = rows24h.filter((r) => r.action === "agent_execute_run").length;
  const automationReliability = buildAutomationReliability(agentRuns24h);
  const cost = buildCostSnapshot(input.spending, agentRuns24h);
  const prReadyCount = candidates.filter((c) => c.lane === "auto_pr").length;
  const autoExecutableCount = candidates.filter((c) => c.lane === "auto_execute").length;
  const adminReviewCount = candidates.filter((c) => c.lane === "admin_review").length;
  const blockedCount = candidates.filter((c) => c.lane === "blocked").length;
  const anomalies = buildOperationalAnomalies({
    rows24h,
    sourceStats24h,
    decisionStats24h,
    candidates,
    cost,
    automationReliability,
    agentRuns24h,
    agentDecisions24h,
    generatedAt,
  });
  const healthScore = buildHealthScore({
    automationReliability,
    cost,
    candidates,
    anomalies,
  });
  const digest = buildDigest({
    generatedAt,
    agentRuns24h,
    agentDecisions24h,
    sourceStats24h,
    decisionStats24h,
    candidates,
    cost,
    anomalies,
  });

  return {
    generatedAt,
    healthScore,
    agentRuns24h,
    agentDecisions24h,
    anomalyCount: anomalies.length,
    criticalAnomalyCount: anomalies.filter((a) => a.severity === "critical").length,
    prReadyCount,
    autoExecutableCount,
    adminReviewCount,
    blockedCount,
    automationReliability,
    anomalies,
    sourceStats24h,
    decisionStats24h,
    candidates,
    digest,
    cost,
  };
}

async function fetchAdminActions(days: number): Promise<AdminActionRow[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * DAY_MS).toISOString();
    const { data, error } = await admin
      .from("admin_actions")
      .select("action, created_at, details")
      .in("action", [
        "agent_diagnose_run",
        "agent_execute_run",
        "autonomous_improvement_scan_run",
        "blog_publish_run",
        "cron_retry_run",
        "llm_usage_summary",
      ])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return [];
    return ((data ?? []) as AdminActionRow[]).map(normalizeRow);
  } catch {
    return [];
  }
}

async function fetchImprovementScans(days: number): Promise<AdminActionRow[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * DAY_MS).toISOString();
    const { data, error } = await admin
      .from("admin_actions")
      .select("action, created_at, details")
      .eq("action", "autonomous_improvement_scan_run")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return [];
    return ((data ?? []) as AdminActionRow[]).map(normalizeRow);
  } catch {
    return [];
  }
}

function normalizeRow(row: AdminActionRow): AdminActionRow {
  return {
    action: row.action,
    created_at: row.created_at,
    details: isRecord(row.details) ? row.details : null,
  };
}

function buildSourceStats(rows: AdminActionRow[]): LearningLoopSourceStat[] {
  const stats = new Map<string, LearningLoopSourceStat>();
  for (const row of rows) {
    if (row.action !== "agent_diagnose_run" && row.action !== "agent_execute_run") continue;
    const source = stringValue(row.details?.source) || "unknown";
    const current =
      stats.get(source) ??
      { source, diagnoseRuns: 0, executeRuns: 0, lastSeenAt: null };
    if (row.action === "agent_diagnose_run") current.diagnoseRuns += 1;
    if (row.action === "agent_execute_run") current.executeRuns += 1;
    if (!current.lastSeenAt || row.created_at > current.lastSeenAt) {
      current.lastSeenAt = row.created_at;
    }
    stats.set(source, current);
  }
  return [...stats.values()].sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
}

function buildDecisionStats(rows: AdminActionRow[]): LearningLoopDecisionStat[] {
  const stats = new Map<string, LearningLoopDecisionStat>();
  for (const row of rows) {
    if (row.action !== "agent_execute_run") continue;
    const mode = stringValue(row.details?.decision_mode) || "unknown";
    const risk = stringValue(row.details?.decision_risk) || "unknown";
    const key = `${mode}:${risk}`;
    const current = stats.get(key) ?? { mode, risk, count: 0 };
    current.count += 1;
    stats.set(key, current);
  }
  return [...stats.values()].sort((a, b) => b.count - a.count);
}

function buildImprovementCandidates(
  scanRows: AdminActionRow[],
  rows24h: AdminActionRow[],
): ImprovementCandidate[] {
  const grouped = new Map<string, ImprovementCandidate>();

  for (const row of scanRows) {
    const recommendations = arrayValue(row.details?.recommendations);
    for (const value of recommendations) {
      if (!isRecord(value)) continue;
      const title = stringValue(value.title) || "Untitled improvement";
      const area = stringValue(value.area) || "unknown";
      const severity = toSeverity(value.severity);
      const evidence = stringValue(value.evidence) || "";
      const action = stringValue(value.action) || "";
      const key = `${area}:${title}:${evidence}`.slice(0, 220);
      const existing = grouped.get(key);
      if (existing) {
        existing.occurrences += 1;
        existing.firstSeenAt = minIso(existing.firstSeenAt, row.created_at);
        existing.lastSeenAt = maxIso(existing.lastSeenAt, row.created_at);
        existing.severity =
          SEVERITY_RANK[severity] < SEVERITY_RANK[existing.severity]
            ? severity
            : existing.severity;
      } else {
        grouped.set(key, {
          key,
          title,
          area,
          severity,
          occurrences: 1,
          firstSeenAt: row.created_at,
          lastSeenAt: row.created_at,
          evidence,
          action,
          lane: laneFor(severity, action),
        });
      }
    }
  }

  for (const row of rows24h) {
    if (row.action !== "agent_execute_run") continue;
    const evidence = stringValue(row.details?.evidence) || "";
    if (!evidence) continue;
    const action = stringValue(row.details?.action) || "agent_action";
    const risk = stringValue(row.details?.decision_risk);
    const severity = risk === "critical" || risk === "high" ? "high" : risk === "medium" ? "medium" : "low";
    const key = `agent:${action}:${evidence}`.slice(0, 220);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        title: `Agent recommendation: ${action}`,
        area: stringValue(row.details?.area) || "agent",
        severity,
        occurrences: 1,
        firstSeenAt: row.created_at,
        lastSeenAt: row.created_at,
        evidence,
        action: stringValue(row.details?.decision_reason) || "Review agent policy decision.",
        lane: laneFor(severity, action),
      });
    }
  }

  return [...grouped.values()]
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.occurrences - a.occurrences || b.lastSeenAt.localeCompare(a.lastSeenAt);
    })
    .slice(0, 12);
}

function buildCostSnapshot(
  spending: GeminiSpendingSnapshot | null,
  agentRuns24h: number,
): CostEffectivenessSnapshot {
  const totalCostKrw = spending?.totalCostKrw ?? 0;
  const monthlyProjectionKrw = spending?.monthlyProjectionKrw ?? 0;
  const capRatio = Math.min(1, monthlyProjectionKrw / GEMINI_KEEPIOO_CAP_KRW);
  const costPerAgentRunKrw =
    agentRuns24h > 0 ? Math.round((totalCostKrw / agentRuns24h) * 10) / 10 : null;
  const recommendation =
    capRatio >= 0.8
      ? "Reduce content generation cadence or add stricter LLM caps before monthly spend exceeds budget."
      : agentRuns24h < 300
        ? "Increase heartbeat reliability before spending more on higher-capacity automation."
        : "Current automation spend is inside the guardrail.";

  return {
    windowDays: spending?.windowDays ?? 28,
    totalCostKrw: Math.round(totalCostKrw),
    monthlyProjectionKrw: Math.round(monthlyProjectionKrw),
    capKrw: GEMINI_KEEPIOO_CAP_KRW,
    capRatio,
    totalCalls: spending?.totalCalls ?? 0,
    agentRuns24h,
    costPerAgentRunKrw,
    recommendation,
  };
}

function buildAutomationReliability(agentRuns24h: number): AutomationReliabilitySnapshot {
  const completionRatio = Math.min(1, agentRuns24h / RESIDENT_HEARTBEAT_TARGET_24H);
  const missingRuns = Math.max(0, RESIDENT_HEARTBEAT_TARGET_24H - agentRuns24h);
  return {
    targetRuns24h: RESIDENT_HEARTBEAT_TARGET_24H,
    actualRuns24h: agentRuns24h,
    missingRuns,
    completionRatio,
    status: completionRatio >= 0.95 ? "healthy" : completionRatio >= 0.5 ? "watch" : "cold",
  };
}

function buildHealthScore(input: {
  automationReliability: AutomationReliabilitySnapshot;
  cost: CostEffectivenessSnapshot;
  candidates: ImprovementCandidate[];
  anomalies: OperationalAnomaly[];
}) {
  const reliabilityScore = input.automationReliability.completionRatio * 60;
  const costScore = (1 - Math.min(1, input.cost.capRatio)) * 20;
  const highPenalty = input.candidates.filter((c) => c.severity === "high").length * 8;
  const blockedPenalty = input.candidates.filter((c) => c.lane === "blocked").length * 6;
  const anomalyPenalty = input.anomalies.reduce((sum, anomaly) => {
    switch (anomaly.severity) {
      case "critical":
        return sum + 14;
      case "high":
        return sum + 8;
      case "medium":
        return sum + 4;
      default:
        return sum + 1;
    }
  }, 0);
  return Math.max(
    0,
    Math.min(100, Math.round(reliabilityScore + costScore + 20 - highPenalty - blockedPenalty - anomalyPenalty)),
  );
}

function buildDigest(input: {
  generatedAt: string;
  agentRuns24h: number;
  agentDecisions24h: number;
  sourceStats24h: LearningLoopSourceStat[];
  decisionStats24h: LearningLoopDecisionStat[];
  candidates: ImprovementCandidate[];
  cost: CostEffectivenessSnapshot;
  anomalies: OperationalAnomaly[];
}): LearningDigest {
  const activeSources = input.sourceStats24h.filter((s) => s.diagnoseRuns > 0).length;
  const highCandidates = input.candidates.filter((c) => c.severity === "high").length;
  const prCandidates = input.candidates.filter((c) => c.lane === "auto_pr").length;
  const criticalAnomalies = input.anomalies.filter((a) => a.severity === "critical").length;
  const highAnomalies = input.anomalies.filter((a) => a.severity === "high").length;
  return {
    periodHours: 24,
    generatedAt: input.generatedAt,
    summary: `${input.agentRuns24h} diagnostics, ${input.agentDecisions24h} decisions, ${input.candidates.length} learned candidates, ${input.anomalies.length} anomalies.`,
    wins: [
      `${activeSources} heartbeat sources reported in the last 24h.`,
      `${input.decisionStats24h.find((s) => s.mode === "auto_execute")?.count ?? 0} low-risk decisions stayed automatic.`,
      `Projected LLM spend is ${Math.round(input.cost.capRatio * 100)}% of cap.`,
    ],
    risks: [
      ...(input.agentRuns24h < RESIDENT_HEARTBEAT_TARGET_24H
        ? [`Resident diagnostics are below the ${RESIDENT_HEARTBEAT_TARGET_24H}/day reliability target.`]
        : []),
      ...(highCandidates > 0 ? [`${highCandidates} high-severity improvement candidates need attention.`] : []),
      ...(highAnomalies > 0 ? [`${highAnomalies} high-severity anomalies detected.`] : []),
      ...(criticalAnomalies > 0 ? [`${criticalAnomalies} critical anomalies need immediate review.`] : []),
      ...(input.cost.capRatio >= 0.8 ? ["LLM monthly projection is above 80% of cap."] : []),
    ],
    nextActions: [
      ...(prCandidates > 0 ? [`Promote ${prCandidates} repeated safe candidates into GitHub PR work.`] : []),
      ...(input.anomalies[0] ? [`Top anomaly: ${input.anomalies[0].title}`] : []),
      ...(input.candidates[0] ? [`Top candidate: ${input.candidates[0].title}`] : ["Keep collecting learning signals."]),
    ],
  };
}

function buildOperationalAnomalies(input: {
  rows24h: AdminActionRow[];
  sourceStats24h: LearningLoopSourceStat[];
  decisionStats24h: LearningLoopDecisionStat[];
  candidates: ImprovementCandidate[];
  cost: CostEffectivenessSnapshot;
  automationReliability: AutomationReliabilitySnapshot;
  agentRuns24h: number;
  agentDecisions24h: number;
  generatedAt: string;
}): OperationalAnomaly[] {
  const anomalies: OperationalAnomaly[] = [];
  const sourceStats = input.sourceStats24h.filter((s) => s.diagnoseRuns > 0 || s.executeRuns > 0);
  const sourceTotals = sourceStats.map((s) => ({
    stat: s,
    total: s.diagnoseRuns + s.executeRuns,
  }));
  const topSource = sourceTotals.reduce<(typeof sourceTotals)[number] | null>(
    (best, current) => {
      if (!best || current.total > best.total) return current;
      return best;
    },
    null,
  );
  const totalRuns = sourceTotals.reduce((sum, entry) => sum + entry.total, 0);
  const unknownSourceRuns = sourceStats.find((s) => s.source === "unknown");
  const cronRetryCount = input.rows24h.filter((row) => row.action === "cron_retry_run").length;
  const highCandidates = input.candidates.filter((candidate) => candidate.severity === "high").length;
  const blockedCandidates = input.candidates.filter((candidate) => candidate.lane === "blocked").length;
  const prCandidates = input.candidates.filter((candidate) => candidate.lane === "auto_pr").length;

  if (input.automationReliability.actualRuns24h === 0) {
    anomalies.push({
      key: "resident-cycle-empty",
      title: "Resident cycle stopped",
      area: "automation",
      severity: "critical",
      evidence: "No agent_diagnose_run events were recorded in the last 24h.",
      recommendation: "Check cron delivery, CRON_SECRET, and the Vercel deployment path immediately.",
      signal: "resident_cycle_zero",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  } else if (input.automationReliability.completionRatio < 0.5) {
    anomalies.push({
      key: "resident-cycle-cold",
      title: "Resident cycle is cold",
      area: "automation",
      severity: "high",
      evidence: `${input.automationReliability.actualRuns24h}/${input.automationReliability.targetRuns24h} runs in 24h.`,
      recommendation: "Increase resident-cycle frequency or restore the missed source.",
      signal: "resident_cycle_cold",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  } else if (input.automationReliability.completionRatio < 1) {
    anomalies.push({
      key: "resident-cycle-under-target",
      title: "Resident cycle is below target",
      area: "automation",
      severity: "medium",
      evidence: `${input.automationReliability.missingRuns} runs missing from the 24h target.`,
      recommendation: "Keep collecting signals and restore the missing heartbeat capacity.",
      signal: "resident_cycle_under_target",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (sourceStats.length === 0) {
    anomalies.push({
      key: "no-sources",
      title: "No source activity",
      area: "source_health",
      severity: "critical",
      evidence: "No source-specific diagnostics or executions were observed.",
      recommendation: "Verify admin_actions ingestion and the resident source aliases.",
      signal: "source_empty",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  } else if (topSource && totalRuns > 0 && topSource.total / totalRuns > 0.85) {
    anomalies.push({
      key: `source-dominance:${topSource.stat.source}`,
      title: "Single source dominates the loop",
      area: "source_health",
      severity: "medium",
      evidence: `${topSource.stat.source} contributes ${(100 * (topSource.total / totalRuns)).toFixed(0)}% of recent activity.`,
      recommendation: "Bring the secondary source back or treat the current source as a fallback-only path.",
      signal: "source_dominance",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (unknownSourceRuns) {
    anomalies.push({
      key: "unknown-source",
      title: "Unknown source events detected",
      area: "data_quality",
      severity: "medium",
      evidence: `Unknown source recorded ${unknownSourceRuns.diagnoseRuns + unknownSourceRuns.executeRuns} times.`,
      recommendation: "Fix the caller source mapping before the unknown bucket grows.",
      signal: "unknown_source",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (cronRetryCount >= 3) {
    anomalies.push({
      key: "cron-retry-storm",
      title: "Cron retry storm",
      area: "cron_health",
      severity: cronRetryCount >= 6 ? "high" : "medium",
      evidence: `${cronRetryCount} cron retry events in 24h.`,
      recommendation: "Inspect the last failed cron and reduce retry noise until the root cause is fixed.",
      signal: "cron_retry_storm",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (input.cost.capRatio >= 0.8) {
    anomalies.push({
      key: "llm-cap-pressure",
      title: "LLM budget pressure",
      area: "cost",
      severity: "high",
      evidence: `Projected monthly spend is ${Math.round(input.cost.capRatio * 100)}% of cap.`,
      recommendation: "Lower generation cadence, throttle repeats, or tighten the cap before the month closes.",
      signal: "cost_cap_pressure",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (highCandidates >= 3) {
    anomalies.push({
      key: "high-candidate-backlog",
      title: "High-severity backlog is building",
      area: "improvement_queue",
      severity: "high",
      evidence: `${highCandidates} high-severity improvement candidates are waiting.`,
      recommendation: "Review the top blockers before the queue absorbs more low-risk work.",
      signal: "high_candidate_backlog",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (blockedCandidates > 0) {
    anomalies.push({
      key: "blocked-candidates",
      title: "Blocked recommendations were generated",
      area: "policy",
      severity: "critical",
      evidence: `${blockedCandidates} candidate(s) were classified as blocked.`,
      recommendation: "Audit the blocked action paths and keep them out of auto-execution.",
      signal: "blocked_recommendations",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (prCandidates >= 5) {
    anomalies.push({
      key: "pr-burst",
      title: "PR queue burst",
      area: "github_work_queue",
      severity: "medium",
      evidence: `${prCandidates} candidates are ready for GitHub PR work.`,
      recommendation: "Create a small batch of PRs rather than pushing all changes into one review.",
      signal: "pr_queue_burst",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  if (input.agentDecisions24h > input.agentRuns24h * 2 && input.agentRuns24h > 0) {
    anomalies.push({
      key: "decision-skew",
      title: "Decision skew detected",
      area: "agent_policy",
      severity: "medium",
      evidence: `${input.agentDecisions24h} execute decisions for ${input.agentRuns24h} diagnostics.`,
      recommendation: "Check whether repeated execution decisions are masking a diagnostic issue.",
      signal: "decision_skew",
      firstSeenAt: input.generatedAt,
      lastSeenAt: input.generatedAt,
    });
  }

  return anomalies
    .sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity))
    .slice(0, 8);
}

function severityWeight(value: OperationalAnomaly["severity"]) {
  switch (value) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

function laneFor(
  severity: ImprovementCandidate["severity"],
  action: string,
): ImprovementCandidate["lane"] {
  const lower = action.toLowerCase();
  if (lower.includes("delete") || lower.includes("secret") || lower.includes("payment")) {
    return "blocked";
  }
  if (severity === "high") return "admin_review";
  if (severity === "medium") return "auto_pr";
  return "auto_execute";
}

function toSeverity(value: unknown): ImprovementCandidate["severity"] {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function minIso(a: string, b: string) {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string) {
  return a >= b ? a : b;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
