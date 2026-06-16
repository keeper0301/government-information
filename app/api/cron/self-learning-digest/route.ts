// ============================================================
// /api/cron/self-learning-digest — 자가 진화 학습 결과 텔레그램 요약 (Spec 1+2+3-B)
// ============================================================
// 매주 월 03:30 KST (UTC 일 18:30). 학습 3 cron 가동 직후 결과 요약:
//   02:00 press_confidence_tune_run
//   02:30 popularity_weights_tune_run
//   03:00 push_time_learn_run
//   03:30 ↓ 이 cron — 위 3건 결과 admin_actions fetch + 텔레그램 발송
//
// 사장님 매주 한 번 hub 안 봐도 학습 진행 가시화 + 변경 발생 시 즉시 인지.
// 텔레그램 발송 실패 (SMS 룰 동일) 시 audit 로 흔적 + 후속 health-alert.
// ============================================================

import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { buildDigest } from "@/lib/autonomous-ops/self-learning-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  try {
    const digest = await buildDigest();
    const result = await sendOpsAlertTelegram({
      subject: "자가 진화 학습 다이제스트",
      message: digest,
    });
    if (result.ok) {
      return { success: true, sent: result.sent, failed: result.failed };
    }
    return {
      success: false,
      reason: result.reason,
      error: "error" in result ? result.error : undefined,
    };
  } catch (err) {
    return { success: false, reason: "exception", error: (err as Error).message };
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();
  await logAdminAction({
    actorId: null,
    action: "self_learning_digest_run",
    details: result,
  });
  await auditCronRun("self_learning_digest_run", {
    success: result.success,
    error: result.success ? undefined : "error" in result ? result.error : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
