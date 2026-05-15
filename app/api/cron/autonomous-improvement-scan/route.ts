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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

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
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
