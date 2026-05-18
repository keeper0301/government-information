// ============================================================
// /api/cron/press-legacy-cleanup — 매주 press 큐 자동 정리 (2026-05-18)
// ============================================================
// 사장님 매주 1 click "legacy 일괄 해제" 도 자동화. 일요일 KST 03:00.
//
// 처리 대상:
//   - confidence_tier IS NULL + 7일+ 묵음 (legacy)
//   - confidence_tier = 'low' + 14일+ 묵음 (사장님 검수 안 한 low 신선도 끝)
//
// 처리 후 admin_actions audit 자동 기록 + 사장님 텔레그램 1회 통지.
// ============================================================

import { NextResponse } from "next/server";
import { bulkRejectLegacyPressCandidates } from "@/lib/press-ingest/candidates";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function rejectStaleLowTier(): Promise<{ rejected: number; ids: string[] }> {
  // low tier 14일+ 묵음 — 사장님 의지 (5/18 "전부 reject") 따른 자동 처리.
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const { data: targets } = await admin
    .from("press_ingest_candidates")
    .select("id")
    .eq("status", "pending")
    .eq("confidence_tier", "low")
    .lt("created_at", cutoff);
  const ids = (targets ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { rejected: 0, ids: [] };

  const now = new Date().toISOString();
  await admin
    .from("press_ingest_candidates")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: null,
      updated_at: now,
    })
    .in("id", ids)
    .eq("status", "pending");

  await logAdminAction({
    actorId: null,
    action: "press_l2_reject" as AdminActionType,
    details: {
      bulk: true,
      reason: "low_tier_14d_auto_cleanup",
      tier: "low",
      rejected_count: ids.length,
      candidate_ids: ids,
      triggered_by: "press-legacy-cleanup_cron",
    },
  });

  return { rejected: ids.length, ids };
}

async function run() {
  const [legacyResult, lowResult] = await Promise.all([
    bulkRejectLegacyPressCandidates(null, { olderThanHours: 168 }),
    rejectStaleLowTier(),
  ]);

  const total = legacyResult.rejected + lowResult.rejected;
  if (total > 0) {
    await sendOpsAlertMultichannel({
      subject: `[keepioo] press 큐 자동 정리 ${total}건`,
      message: [
        `매주 일요일 자동 cleanup 가동.`,
        `legacy (null tier 7일+): ${legacyResult.rejected}건`,
        `low tier (14일+ 묵음): ${lowResult.rejected}건`,
        ``,
        `사장님 매주 1 click 도 자동화 완료. /admin/press-ingest 큐 가독성 ↑`,
      ].join("\n"),
      link: "https://www.keepioo.com/admin/press-ingest",
    });
  }

  return NextResponse.json({
    ok: true,
    legacy_rejected: legacyResult.rejected,
    low_rejected: lowResult.rejected,
    total,
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
