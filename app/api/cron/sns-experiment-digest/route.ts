// ============================================================
// /api/cron/sns-experiment-digest — Threads lead 실험 일일 운영 요약
// ============================================================
// 자동 글발행 가독성 개선 이후 lead_0~5 실험이 켜졌으니, 클릭 성과와
// challenger 확대/중단 후보를 매일 텔레그램으로 보낸다. 실제 정책 변경은
// 이 route가 하지 않는다. /admin/sns-control-tower에서 사람 승인만 허용.
// ============================================================

import { NextResponse } from "next/server";
import { buildSnsExperimentDigest, getSnsUtmPerformance } from "@/lib/analytics/sns-utm-performance";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { loadSnsLeadPolicySnapshot } from "@/lib/sns-control-tower/lead-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run() {
  const [utmPerformance, leadPolicy] = await Promise.all([
    getSnsUtmPerformance(30),
    loadSnsLeadPolicySnapshot(),
  ]);
  const digest = buildSnsExperimentDigest(utmPerformance, leadPolicy);
  const telegram = digest.shouldNotify
    ? await sendOpsAlertTelegram({ subject: digest.subject, message: digest.message })
    : null;

  await logAdminAction({
    actorId: null,
    action: "sns_experiment_digest_run",
    details: {
      severity: digest.severity,
      sessions: utmPerformance.totals.sessions,
      active_users: utmPerformance.totals.activeUsers,
      expansion_candidate_count: digest.expansionCandidateCount,
      pause_candidate_count: digest.pauseCandidateCount,
      challenger_traffic_pct: leadPolicy.challengerTrafficPct,
      telegram,
    },
  });

  return NextResponse.json({
    ok: true,
    digest: {
      severity: digest.severity,
      subject: digest.subject,
      expansion_candidate_count: digest.expansionCandidateCount,
      pause_candidate_count: digest.pauseCandidateCount,
    },
    telegram,
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
