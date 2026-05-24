// ============================================================
// G2 — press-ingest low pending 검수 reminder cron (5/17)
// ============================================================
// 매주 월 KST 09:00 — 사장님께 low tier pending 누적 건수 텔레그램 알림.
// AUTO_CONFIRM 임계치는 mid 그대로 유지 (low 데이터 부족, false positive 위험 ↑).
// 대신 사장님이 low pending 19건+ 검수 안 하는 사고를 reminder 로 알림.
//
// 동시에 90일 경과 low pending → archived 상태 (cleanup, 무한 누적 차단).
// archived 는 reject 와 다름 — 다시 보고 싶을 때 query 가능.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ARCHIVE_AFTER_DAYS = 90;

async function run() {
  const admin = createAdminClient();

  // 1) low pending 누적 건수
  const { count: pendingCount } = await admin
    .from("press_ingest_candidates")
    .select("id", { count: "exact", head: true })
    .eq("confidence_tier", "low")
    .eq("status", "pending");
  const pending = pendingCount ?? 0;

  // 2) 90일 경과 low pending → archived (cleanup, 무한 누적 차단)
  const cutoff = new Date(
    Date.now() - ARCHIVE_AFTER_DAYS * 24 * 3600_000,
  ).toISOString();
  const { data: archivedRows } = await admin
    .from("press_ingest_candidates")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("confidence_tier", "low")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  const archived = (archivedRows ?? []).length;

  // 3) 텔레그램 reminder — 검수 부담 ↓ + 사장님 가시화
  // pending 5건 이상일 때만 알림 (적은 건수는 noise)
  let alertSent = false;
  if (pending >= 5) {
    try {
      await sendOpsAlertMultichannel({
        subject: `[keepioo] press-ingest low pending ${pending}건 검수 대기`,
        message: [
          `📋 광역 보도자료 low 신뢰도 후보 ${pending}건이 사장님 검수 대기 중입니다.`,
          ``,
          archived > 0
            ? `(이번 cron 에서 90일 경과 ${archived}건 archived 처리)`
            : ``,
          ``,
          `[조치] /admin/auto-confirmed 에서 confirm/reject 결정`,
          `link: https://www.keepioo.com/admin/auto-confirmed`,
        ].filter(Boolean).join("\n"),
        link: "https://www.keepioo.com/admin/auto-confirmed",
      });
      alertSent = true;
    } catch (e) {
      console.error("[press-low-reminder] 알림 실패:", e);
    }
  }

  try {
    await logAdminAction({
      actorId: null,
      action: "press_low_reminder_run" as AdminActionType,
      details: { pending, archived, alertSent },
    });
  } catch (e) {
    console.warn("[press-low-reminder] audit 실패:", e);
  }

  return { success: true, pending, archived, alertSent };
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();
  await auditCronRun("press_low_reminder_run", {
    success: result.success,
    pending: result.pending,
    archived: result.archived,
  });
  return NextResponse.json(result);
}
