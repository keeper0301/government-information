// ============================================================
// /api/cron/press-confidence-tune — press_ingest tier_floor 자가 진화 학습 (Spec 1)
// ============================================================
// 매주 월 02:00 KST 실행. 직전 7일 mid 회수율 + low confirm 비율 측정 →
// tier_floor (high/mid/low) 자동 결정 → press_auto_confirm_settings 에 새 row.
//
// 결정 룰:
//   - 데이터 부족 (mid_decided < 10 AND low_decided < 5): no-op + 로그
//   - mid 회수율 > 5% → target='high' (안전 강화, 1단계 cap 무시 — 즉시 보수)
//   - low_confirm_rate > 50% AND data 충분 → target='low' (확장, 1단계 cap)
//   - 그 외 → target='mid' (default 적극)
//
// 변경 폭 cap:
//   - 보수 방향 (→high): 즉시 변경 OK (사고 시 빠른 안전책)
//   - 적극 방향 (→low): 1단계만 (high→mid, mid→low). 점진적 검증.
//
// 외부 가드:
//   - process.env.AUTO_CONFIRM_TIER_FLOOR 가 설정되면 학습값 무시되므로,
//     이 cron 은 항상 새 row insert 하되 효과는 env 가 비어있을 때만.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import {
  getCurrentTierFloor,
  _resetTierFloorCache,
} from "@/lib/press-ingest/auto-confirm-settings";
import { decide, type Measurement } from "@/lib/press-ingest/tier-floor-decide";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 7일 데이터 측정
async function measure(): Promise<Measurement> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [midRev, midDec, lowConf, lowDec] = await Promise.all([
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("confidence_tier", "mid")
      .eq("status", "revoked")
      .gte("updated_at", since),
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("confidence_tier", "mid")
      .in("status", ["confirmed", "revoked"])
      .gte("updated_at", since),
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("confidence_tier", "low")
      .eq("status", "confirmed")
      .gte("updated_at", since),
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("confidence_tier", "low")
      .in("status", ["confirmed", "rejected"])
      .gte("updated_at", since),
  ]);

  const midRevokedCount = midRev.count ?? 0;
  const midDecidedCount = midDec.count ?? 0;
  const lowConfirmedCount = lowConf.count ?? 0;
  const lowDecidedCount = lowDec.count ?? 0;

  return {
    midRevokedCount,
    midDecidedCount,
    midRevokeRatePct:
      midDecidedCount > 0
        ? Math.round((midRevokedCount / midDecidedCount) * 10000) / 100
        : 0,
    lowConfirmedCount,
    lowDecidedCount,
    lowConfirmRatePct:
      lowDecidedCount > 0
        ? Math.round((lowConfirmedCount / lowDecidedCount) * 10000) / 100
        : 0,
  };
}

// decide()·stepTowards()·상수는 lib/press-ingest/tier-floor-decide.ts 로 분리
// (Next.js route export 제약 + 단위 테스트). measure() 는 DB 측정이라 여기 유지.

async function run() {
  const admin = createAdminClient();
  const current = await getCurrentTierFloor();
  const m = await measure();
  const decision = decide(current, m);

  const changed = decision.next !== current;

  // 데이터 부족하면 row insert 하지 않음 — history 가짜 변경 가시화 차단
  if (!decision.sufficient) {
    await logAdminAction({
      actorId: null,
      action: "press_confidence_tune_run",
      details: {
        outcome: "no_op_insufficient_data",
        current,
        reason: decision.reason,
        measurement: m,
      },
    });
    return {
      success: true,
      changed: false,
      current,
      next: current,
      sufficient: false,
      reason: decision.reason,
      measurement: m,
    };
  }

  // 변경 없으면 row insert 안 함 (history 깔끔)
  if (!changed) {
    await logAdminAction({
      actorId: null,
      action: "press_confidence_tune_run",
      details: {
        outcome: "no_change",
        current,
        target: decision.target,
        reason: decision.reason,
        measurement: m,
      },
    });
    return {
      success: true,
      changed: false,
      current,
      next: current,
      sufficient: true,
      reason: decision.reason,
      measurement: m,
    };
  }

  // 새 row insert
  const { error: insertErr } = await admin
    .from("press_auto_confirm_settings")
    .insert({
      tier_floor: decision.next,
      reason: decision.reason,
      mid_revoke_rate_7d: m.midRevokeRatePct,
      low_confirm_rate_7d: m.lowConfirmRatePct,
      mid_decided_count: m.midDecidedCount,
      low_decided_count: m.lowDecidedCount,
      data_snapshot: {
        period_days: 7,
        mid_revoked: m.midRevokedCount,
        mid_decided: m.midDecidedCount,
        low_confirmed: m.lowConfirmedCount,
        low_decided: m.lowDecidedCount,
        previous_floor: current,
        target: decision.target,
      },
      applied_by: "cron_learn",
    });

  if (insertErr) {
    return {
      success: false,
      changed: false,
      current,
      next: current,
      sufficient: true,
      reason: `insert 실패: ${insertErr.message}`,
      measurement: m,
    };
  }

  // 다음 호출 부터 새 값 즉시 반영
  _resetTierFloorCache();

  await logAdminAction({
    actorId: null,
    action: "press_confidence_tune_run",
    details: {
      outcome: "changed",
      current,
      next: decision.next,
      target: decision.target,
      reason: decision.reason,
      measurement: m,
    },
  });

  return {
    success: true,
    changed: true,
    current,
    next: decision.next,
    sufficient: true,
    reason: decision.reason,
    measurement: m,
  };
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();
  await auditCronRun("press_confidence_tune_run", {
    success: result.success,
    changed: result.changed,
    current: result.current,
    next: result.next,
    sufficient: result.sufficient,
    error: result.success ? undefined : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

// POST = GET (cron-trigger 어드민 페이지 대응)
export async function POST(request: Request) {
  return GET(request);
}
