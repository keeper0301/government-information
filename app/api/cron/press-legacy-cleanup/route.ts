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
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function previewStaleLowTier(): Promise<{ count: number; ids: string[] }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const { data: targets } = await admin
    .from("press_ingest_candidates")
    .select("id")
    .eq("status", "pending")
    .eq("confidence_tier", "low")
    .lt("created_at", cutoff);
  const ids = (targets ?? []).map((r) => r.id as string);
  return { count: ids.length, ids };
}

async function previewLegacyNull(): Promise<{ count: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 168 * 3600_000).toISOString();
  const { count } = await admin
    .from("press_ingest_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("confidence_tier", null)
    .lt("created_at", cutoff);
  return { count: count ?? 0 };
}

async function rejectStaleLowTier(): Promise<{ rejected: number; ids: string[] }> {
  // low tier 14일+ 묵음 — 사장님 의지 (5/18 "전부 reject") 따른 자동 처리.
  const preview = await previewStaleLowTier();
  if (preview.count === 0) return { rejected: 0, ids: [] };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin
    .from("press_ingest_candidates")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: null,
      updated_at: now,
    })
    .in("id", preview.ids)
    .eq("status", "pending");

  await logAdminAction({
    actorId: null,
    action: "press_l2_reject" as AdminActionType,
    details: {
      bulk: true,
      reason: "low_tier_14d_auto_cleanup",
      tier: "low",
      rejected_count: preview.ids.length,
      candidate_ids: preview.ids,
      triggered_by: "press-legacy-cleanup_cron",
    },
  });

  return { rejected: preview.ids.length, ids: preview.ids };
}

async function run(dryRun: boolean) {
  // 2026-05-19 — dry-run mode: 사장님 5/24 첫 가동 전 검증용.
  // ?dry=1 query 시 대상 count 만 반환, 실제 reject·alert·audit X.
  if (dryRun) {
    const [legacyPreview, lowPreview] = await Promise.all([
      previewLegacyNull(),
      previewStaleLowTier(),
    ]);
    return NextResponse.json({
      ok: true,
      dry_run: true,
      legacy_pending_target: legacyPreview.count,
      low_pending_target: lowPreview.count,
      low_candidate_ids: lowPreview.ids.slice(0, 10),
      total_would_reject: legacyPreview.count + lowPreview.count,
    });
  }

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
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  return run(dryRun);
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  return run(dryRun);
}
