import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-actions";
import { getLearningLoopSnapshot } from "@/lib/autonomous-ops/learning-loop";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  const snapshot = await getLearningLoopSnapshot();
  const highestSeverity = snapshot.candidates.some((c) => c.severity === "high")
    ? "high"
    : snapshot.candidates.some((c) => c.severity === "medium")
      ? "medium"
      : "low";
  const recommendations = snapshot.candidates.map((candidate) => ({
    title: candidate.title,
    area: candidate.area,
    severity: candidate.severity,
    evidence: candidate.evidence,
    action: candidate.action,
    lane: candidate.lane,
    occurrences: candidate.occurrences,
  }));

  await logAdminAction({
    actorId: null,
    action: "autonomous_improvement_scan_run",
    details: {
      kind: "agent_learning_digest",
      source: "github_actions_daily_digest",
      highestSeverity,
      healthScore: snapshot.healthScore,
      automationReliability: snapshot.automationReliability,
      cost: snapshot.cost,
      digest: snapshot.digest,
      recommendations,
    },
  });

  return NextResponse.json({
    ok: true,
    highestSeverity,
    healthScore: snapshot.healthScore,
    anomalyCount: snapshot.anomalyCount,
    criticalAnomalyCount: snapshot.criticalAnomalyCount,
    automationReliability: snapshot.automationReliability,
    cost: snapshot.cost,
    digest: snapshot.digest,
    anomalies: snapshot.anomalies,
    recommendations,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
