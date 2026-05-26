// ============================================================
// /api/cron/popularity-weights-tune — popularity weights 자가 진화 학습 (Spec 2)
// ============================================================
// 매주 월 02:30 KST 실행. 직전 30일 user_events 측정 →
// view->apply 전환율 기반 apply_weight 자동 튜닝 →
// popularity_weights_history 에 새 row insert.
//
// 결정 룰:
//   - 데이터 부족 (unique_users < 5 OR total_events < 100): no-op
//   - 전환율 < 1% (인기 정책 view 폭주, apply 거의 0): apply_weight +0.5 (cap 4)
//   - 전환율 > 15% (apply 가 view 비해 과다, 다른 시그널 압도 위험): apply_weight -0.5 (min 1)
//   - 그 외: 변경 없음
//
// 안전 가드:
//   - view_weight·max_boost 는 변경 X (apply_weight 만 튜닝). 5/17 검증 hardcode 유지.
//   - 변경 폭 cap: ±0.5 / step
//   - history 가짜 변경 차단: 결정 후 동일 값이면 row insert 안 함.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import {
  loadCurrentWeights,
  _resetWeightsCache,
  type PopularityWeights,
} from "@/lib/personalization/popularity-weights-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_UNIQUE_USERS = 5;
const MIN_TOTAL_EVENTS = 100;
const CONVERSION_STRENGTHEN_PCT = 1;   // < 1% — apply_weight +0.5
const CONVERSION_WEAKEN_PCT = 15;      // > 15% — apply_weight -0.5
const APPLY_WEIGHT_MAX = 4;
const APPLY_WEIGHT_MIN = 1;
const APPLY_WEIGHT_STEP = 0.5;

type Measurement = {
  viewCount: number;
  applyCount: number;
  uniqueUsers: number;
  totalEvents: number;
  conversionRatePct: number;
};

async function measure(): Promise<Measurement> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const { data, error } = await admin
    .from("user_events")
    .select("event_type, user_id")
    .gte("created_at", since)
    .in("event_type", ["program_view", "apply_click"])
    .not("program_id", "is", null);

  if (error || !data) {
    return {
      viewCount: 0,
      applyCount: 0,
      uniqueUsers: 0,
      totalEvents: 0,
      conversionRatePct: 0,
    };
  }

  let viewCount = 0;
  let applyCount = 0;
  const userSet = new Set<string>();
  for (const row of data as Array<{ event_type: string; user_id: string | null }>) {
    if (row.event_type === "program_view") viewCount += 1;
    if (row.event_type === "apply_click") applyCount += 1;
    if (row.user_id) userSet.add(row.user_id);
  }

  const totalEvents = viewCount + applyCount;
  const conversionRatePct =
    viewCount > 0 ? Math.round((applyCount / viewCount) * 10000) / 100 : 0;

  return {
    viewCount,
    applyCount,
    uniqueUsers: userSet.size,
    totalEvents,
    conversionRatePct,
  };
}

function decide(current: PopularityWeights, m: Measurement): {
  next: PopularityWeights;
  reason: string;
  sufficient: boolean;
} {
  const sufficient =
    m.uniqueUsers >= MIN_UNIQUE_USERS && m.totalEvents >= MIN_TOTAL_EVENTS;

  if (!sufficient) {
    return {
      next: current,
      reason: `데이터 부족 — unique_users ${m.uniqueUsers} (<${MIN_UNIQUE_USERS}) OR total_events ${m.totalEvents} (<${MIN_TOTAL_EVENTS}). 현재 weights 유지.`,
      sufficient: false,
    };
  }

  // 전환율 < 1% — apply 강화 (apply_weight +0.5)
  if (m.conversionRatePct < CONVERSION_STRENGTHEN_PCT) {
    const nextApply = Math.min(
      APPLY_WEIGHT_MAX,
      Math.round((current.applyWeight + APPLY_WEIGHT_STEP) * 100) / 100,
    );
    return {
      next: { ...current, applyWeight: nextApply },
      reason: `전환율 ${m.conversionRatePct}% (<${CONVERSION_STRENGTHEN_PCT}%) — apply 강화. apply_weight ${current.applyWeight} → ${nextApply} (cap ${APPLY_WEIGHT_MAX})`,
      sufficient: true,
    };
  }

  // 전환율 > 15% — apply 약화
  if (m.conversionRatePct > CONVERSION_WEAKEN_PCT) {
    const nextApply = Math.max(
      APPLY_WEIGHT_MIN,
      Math.round((current.applyWeight - APPLY_WEIGHT_STEP) * 100) / 100,
    );
    return {
      next: { ...current, applyWeight: nextApply },
      reason: `전환율 ${m.conversionRatePct}% (>${CONVERSION_WEAKEN_PCT}%) — apply 약화. apply_weight ${current.applyWeight} → ${nextApply} (min ${APPLY_WEIGHT_MIN})`,
      sufficient: true,
    };
  }

  // 정상 범위 — 변경 없음
  return {
    next: current,
    reason: `전환율 ${m.conversionRatePct}% (정상 범위 ${CONVERSION_STRENGTHEN_PCT}~${CONVERSION_WEAKEN_PCT}%) — weights 유지`,
    sufficient: true,
  };
}

async function run() {
  const admin = createAdminClient();
  const current = await loadCurrentWeights();
  const m = await measure();
  const decision = decide(current, m);

  const changed =
    decision.next.viewWeight !== current.viewWeight ||
    decision.next.applyWeight !== current.applyWeight ||
    decision.next.maxBoost !== current.maxBoost;

  // 데이터 부족 또는 변경 없음 → row insert 안 함, audit 만
  if (!decision.sufficient || !changed) {
    await logAdminAction({
      actorId: null,
      action: "popularity_weights_tune_run",
      details: {
        outcome: decision.sufficient ? "no_change" : "no_op_insufficient_data",
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
      sufficient: decision.sufficient,
      reason: decision.reason,
      measurement: m,
    };
  }

  // 새 row insert
  const { error: insertErr } = await admin
    .from("popularity_weights_history")
    .insert({
      view_weight: decision.next.viewWeight,
      apply_weight: decision.next.applyWeight,
      max_boost: decision.next.maxBoost,
      reason: decision.reason,
      conversion_rate_30d: m.conversionRatePct,
      unique_users_30d: m.uniqueUsers,
      total_events_30d: m.totalEvents,
      data_snapshot: {
        period_days: 30,
        view_count: m.viewCount,
        apply_count: m.applyCount,
        previous_weights: current,
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

  // 다음 호출 부터 새 weights 즉시 반영
  _resetWeightsCache();

  await logAdminAction({
    actorId: null,
    action: "popularity_weights_tune_run",
    details: {
      outcome: "changed",
      current,
      next: decision.next,
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
  await auditCronRun("popularity_weights_tune_run", {
    success: result.success,
    changed: result.changed,
    sufficient: result.sufficient,
    error: result.success ? undefined : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
