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

export type LearningLoopSnapshot = {
  generatedAt: string;
  healthScore: number;
  agentRuns24h: number;
  agentDecisions24h: number;
  prReadyCount: number;
  autoExecutableCount: number;
  adminReviewCount: number;
  blockedCount: number;
  automationReliability: AutomationReliabilitySnapshot;
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
  const healthScore = buildHealthScore({
    automationReliability,
    cost,
    candidates,
  });
  const digest = buildDigest({
    generatedAt,
    agentRuns24h,
    agentDecisions24h,
    sourceStats24h,
    decisionStats24h,
    candidates,
    cost,
  });

  return {
    generatedAt,
    healthScore,
    agentRuns24h,
    agentDecisions24h,
    prReadyCount,
    autoExecutableCount,
    adminReviewCount,
    blockedCount,
    automationReliability,
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
}) {
  const reliabilityScore = input.automationReliability.completionRatio * 60;
  const costScore = (1 - Math.min(1, input.cost.capRatio)) * 20;
  const highPenalty = input.candidates.filter((c) => c.severity === "high").length * 8;
  const blockedPenalty = input.candidates.filter((c) => c.lane === "blocked").length * 6;
  return Math.max(0, Math.min(100, Math.round(reliabilityScore + costScore + 20 - highPenalty - blockedPenalty)));
}

function buildDigest(input: {
  generatedAt: string;
  agentRuns24h: number;
  agentDecisions24h: number;
  sourceStats24h: LearningLoopSourceStat[];
  decisionStats24h: LearningLoopDecisionStat[];
  candidates: ImprovementCandidate[];
  cost: CostEffectivenessSnapshot;
}): LearningDigest {
  const activeSources = input.sourceStats24h.filter((s) => s.diagnoseRuns > 0).length;
  const highCandidates = input.candidates.filter((c) => c.severity === "high").length;
  const prCandidates = input.candidates.filter((c) => c.lane === "auto_pr").length;
  return {
    periodHours: 24,
    generatedAt: input.generatedAt,
    summary: `${input.agentRuns24h} diagnostics, ${input.agentDecisions24h} decisions, ${input.candidates.length} learned candidates.`,
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
      ...(input.cost.capRatio >= 0.8 ? ["LLM monthly projection is above 80% of cap."] : []),
    ],
    nextActions: [
      ...(prCandidates > 0 ? [`Promote ${prCandidates} repeated safe candidates into GitHub PR work.`] : []),
      ...(input.candidates[0] ? [`Top candidate: ${input.candidates[0].title}`] : ["Keep collecting learning signals."]),
    ],
  };
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
