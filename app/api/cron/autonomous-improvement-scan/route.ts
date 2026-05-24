// ============================================================
// /api/cron/autonomous-improvement-scan
// ============================================================
// 매일 운영 데이터를 읽고 "다음 개선 과제"를 admin_actions 에 남긴다.
// 실제 코드/DB 자동 수정은 하지 않는다. 위험한 변경은 사람이 검토한다.
// ============================================================

import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-actions";
import {
  buildImprovementRecommendations,
  collectImprovementSnapshot,
} from "@/lib/autonomous-ops/improvement-scan";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  const snapshot = await collectImprovementSnapshot();
  const recommendations = buildImprovementRecommendations(snapshot);
  const highestSeverity = recommendations.some((r) => r.severity === "high")
    ? "high"
    : recommendations.some((r) => r.severity === "medium")
      ? "medium"
      : "low";

  try {
    await logAdminAction({
      actorId: null,
      action: "autonomous_improvement_scan_run",
      details: {
        highestSeverity,
        snapshot,
        recommendations,
      },
    });
  } catch (e) {
    console.warn(
      "[autonomous-improvement-scan] admin_actions 기록 실패:",
      (e as Error).message,
    );
  }

  return NextResponse.json({
    ok: true,
    highestSeverity,
    snapshot,
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
