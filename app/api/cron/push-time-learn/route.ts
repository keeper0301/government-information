// ============================================================
// /api/cron/push-time-learn — PWA 푸시 시점 자가 진화 학습 (Spec 3-B)
// ============================================================
// 매주 월 03:00 KST. 활성 subscriber 의 사용자별 30일 push_notification_log
// → 시간대별 click_rate 상위 3개를 preferred_hours 에 update.
//
// 가드:
//   - 누적 발송 < 14건 (2주): default [9,12,18] 유지
//   - click 0: default 유지 (선호 불명)
// ============================================================

import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import {
  listActiveLearnUsers,
  learnUserPreferredHours,
  persistUserLearnResult,
} from "@/lib/push/time-learn";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  const userIds = await listActiveLearnUsers();
  if (userIds.length === 0) {
    return {
      success: true,
      reason: "no_active_users",
      total: 0,
      changed: 0,
      skipped: 0,
    };
  }

  let changed = 0;
  let skipped = 0;
  const summary: Array<{
    userId: string;
    skipped: boolean;
    skipReason?: string;
    changed: boolean;
    totalSent: number;
    totalClicked: number;
    oldHours: number[];
    newHours: number[];
  }> = [];

  for (const userId of userIds) {
    const result = await learnUserPreferredHours(userId);
    await persistUserLearnResult(result);
    if (result.changed) changed += 1;
    if (result.skipped) skipped += 1;
    summary.push({
      userId,
      skipped: result.skipped,
      skipReason: result.skipReason,
      changed: result.changed,
      totalSent: result.totalSent,
      totalClicked: result.totalClicked,
      oldHours: result.oldPreferredHours,
      newHours: result.newPreferredHours,
    });
  }

  return {
    success: true,
    total: userIds.length,
    changed,
    skipped,
    summary,
  };
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();
  await logAdminAction({
    actorId: null,
    action: "push_time_learn_run",
    details: {
      total: result.total,
      changed: result.changed,
      skipped: result.skipped,
      summary: result.summary,
    },
  });
  await auditCronRun("push_time_learn_run", {
    success: result.success,
    total: result.total,
    changed: result.changed,
    skipped: result.skipped,
    error: result.success ? undefined : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
