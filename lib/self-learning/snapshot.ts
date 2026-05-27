// ============================================================
// 자가 진화 학습 snapshot (Spec 1 + Spec 2 통합 조회)
// ============================================================
// /admin/autonomous SelfLearningCard 에 노출되는 데이터.
//   - Spec 1: press_auto_confirm_settings (tier_floor)
//   - Spec 2: popularity_weights_history (view/apply/max weight)
// 각 시스템의 latest row + 다음 학습 cron 시각.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type PressTierAppliedBy = "cron_learn" | "manual_override" | "initial_seed";

export type SelfLearningPressTier = {
  current: "high" | "mid" | "low";
  appliedBy: PressTierAppliedBy;
  reason: string;
  effectiveFrom: string;
  midRevokeRate7d: number | null;
  lowConfirmRate7d: number | null;
  midDecidedCount: number | null;
  lowDecidedCount: number | null;
  nextCronKst: string; // 'YYYY-MM-DD 02:00 KST'
};

export type SelfLearningPopularityWeights = {
  viewWeight: number;
  applyWeight: number;
  maxBoost: number;
  appliedBy: PressTierAppliedBy;
  reason: string;
  effectiveFrom: string;
  conversionRate30d: number | null;
  uniqueUsers30d: number | null;
  totalEvents30d: number | null;
  nextCronKst: string; // 'YYYY-MM-DD 02:30 KST'
};

// 7주 추세 timeline 표시용 — latest 보다 간소화된 형식
export type PressTierHistoryEntry = {
  tierFloor: "high" | "mid" | "low";
  appliedBy: PressTierAppliedBy;
  effectiveFrom: string;
  reason: string;
};

export type PopularityWeightsHistoryEntry = {
  viewWeight: number;
  applyWeight: number;
  maxBoost: number;
  appliedBy: PressTierAppliedBy;
  effectiveFrom: string;
  reason: string;
};

export type SelfLearningSnapshot = {
  pressTier: SelfLearningPressTier | null;
  popularityWeights: SelfLearningPopularityWeights | null;
  // 7주 추세 — latest 포함 (history[0] = pressTier 와 같은 row). 회귀 위험 0.
  pressTierHistory: PressTierHistoryEntry[];
  popularityWeightsHistory: PopularityWeightsHistoryEntry[];
};

// 다음 월요일 KST 일자 (YYYY-MM-DD).
// 오늘이 월요일 + 시각이 cron 기준시 이전이면 오늘, 이후면 다음주 월요일.
function nextMondayKst(now: Date, cronHourKst: number, cronMinKst: number): string {
  // 현재 KST 분단위 (UTC+9). Date 의 UTC 메서드로 시간대 충돌 차단.
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const day = kstNow.getUTCDay(); // 0=일, 1=월, ...
  const hour = kstNow.getUTCHours();
  const min = kstNow.getUTCMinutes();
  let daysUntilMon: number;
  if (day === 1) {
    // 월요일 — 아직 cron 시각 전이면 오늘, 이후면 다음주
    const beforeCron = hour < cronHourKst || (hour === cronHourKst && min < cronMinKst);
    daysUntilMon = beforeCron ? 0 : 7;
  } else {
    daysUntilMon = (8 - day) % 7;
    if (daysUntilMon === 0) daysUntilMon = 7;
  }
  const next = new Date(kstNow.getTime() + daysUntilMon * 86400_000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getSelfLearningSnapshot(): Promise<SelfLearningSnapshot> {
  const admin = createAdminClient();
  const now = new Date();

  // 7주 추세 위해 limit(7) — history[0] 가 latest (단일 source).
  const [tierRes, weightsRes] = await Promise.all([
    admin
      .from("press_auto_confirm_settings")
      .select(
        "tier_floor, applied_by, reason, effective_from, mid_revoke_rate_7d, low_confirm_rate_7d, mid_decided_count, low_decided_count",
      )
      .order("effective_from", { ascending: false })
      .limit(7),
    admin
      .from("popularity_weights_history")
      .select(
        "view_weight, apply_weight, max_boost, applied_by, reason, effective_from, conversion_rate_30d, unique_users_30d, total_events_30d",
      )
      .order("effective_from", { ascending: false })
      .limit(7),
  ]);

  const tierRows = (tierRes.data ?? []) as Array<{
    tier_floor: string;
    applied_by: string;
    reason: string;
    effective_from: string;
    mid_revoke_rate_7d: number | null;
    low_confirm_rate_7d: number | null;
    mid_decided_count: number | null;
    low_decided_count: number | null;
  }>;
  const weightsRows = (weightsRes.data ?? []) as Array<{
    view_weight: number;
    apply_weight: number;
    max_boost: number;
    applied_by: string;
    reason: string;
    effective_from: string;
    conversion_rate_30d: number | null;
    unique_users_30d: number | null;
    total_events_30d: number | null;
  }>;
  const tierLatest = tierRows[0] ?? null;
  const weightsLatest = weightsRows[0] ?? null;

  const pressTier: SelfLearningPressTier | null = tierLatest
    ? {
        current: tierLatest.tier_floor as "high" | "mid" | "low",
        appliedBy: tierLatest.applied_by as PressTierAppliedBy,
        reason: tierLatest.reason,
        effectiveFrom: tierLatest.effective_from,
        midRevokeRate7d:
          tierLatest.mid_revoke_rate_7d === null
            ? null
            : Number(tierLatest.mid_revoke_rate_7d),
        lowConfirmRate7d:
          tierLatest.low_confirm_rate_7d === null
            ? null
            : Number(tierLatest.low_confirm_rate_7d),
        midDecidedCount: tierLatest.mid_decided_count,
        lowDecidedCount: tierLatest.low_decided_count,
        nextCronKst: `${nextMondayKst(now, 2, 0)} 02:00`,
      }
    : null;

  const popularityWeights: SelfLearningPopularityWeights | null = weightsLatest
    ? {
        viewWeight: Number(weightsLatest.view_weight),
        applyWeight: Number(weightsLatest.apply_weight),
        maxBoost: Number(weightsLatest.max_boost),
        appliedBy: weightsLatest.applied_by as PressTierAppliedBy,
        reason: weightsLatest.reason,
        effectiveFrom: weightsLatest.effective_from,
        conversionRate30d:
          weightsLatest.conversion_rate_30d === null
            ? null
            : Number(weightsLatest.conversion_rate_30d),
        uniqueUsers30d: weightsLatest.unique_users_30d,
        totalEvents30d: weightsLatest.total_events_30d,
        nextCronKst: `${nextMondayKst(now, 2, 30)} 02:30`,
      }
    : null;

  const pressTierHistory: PressTierHistoryEntry[] = tierRows.map((r) => ({
    tierFloor: r.tier_floor as "high" | "mid" | "low",
    appliedBy: r.applied_by as PressTierAppliedBy,
    effectiveFrom: r.effective_from,
    reason: r.reason,
  }));

  const popularityWeightsHistory: PopularityWeightsHistoryEntry[] = weightsRows.map(
    (r) => ({
      viewWeight: Number(r.view_weight),
      applyWeight: Number(r.apply_weight),
      maxBoost: Number(r.max_boost),
      appliedBy: r.applied_by as PressTierAppliedBy,
      effectiveFrom: r.effective_from,
      reason: r.reason,
    }),
  );

  return { pressTier, popularityWeights, pressTierHistory, popularityWeightsHistory };
}
