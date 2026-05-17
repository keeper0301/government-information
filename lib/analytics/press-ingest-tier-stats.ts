// ============================================================
// press_ingest 신뢰도 tier 통계 helper (5/17)
// ============================================================
// /api/auto-confirm-stats endpoint + autonomous hub 카드 단일 source.
// 1주차 모니터링 spec (memory project_press_ingest_confidence_tier_2026_05_09).
//
// 핵심 metric:
// - autoConfirm24h/7d: high+mid 자동 등록 누적
// - midRevokeRate7d: mid 사후 회수율 (>5% = 임계 낮추기 위험)
// - lowConfirmRate7d: low pending → 사장님 confirm 률 (>50% = LLM 보수적)
// - lowConfirmRateHint: AUTO_CONFIRM_TIER_FLOOR 튜닝 자동 추천
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type PressIngestTierStats = {
  timestamp: string;
  autoConfirm24h: number;
  highCount24h: number;
  midCount24h: number;
  autoConfirm7d: number;
  highCount7d: number;
  midCount7d: number;
  autoRevoke24h: number;
  autoRevoke7d: number;
  revokeRate7d: number;
  midRevokeRate7d: number;
  midRevokeRateWarning: boolean;
  pressLowTierBacklog: number;
  pressPending: number;
  newsBacklog: number;
  lowConfirmed7d: number;
  lowRejected7d: number;
  lowConfirmRate7d: number;
  lowConfirmRateHint: string;
};

async function safe(
  p: PromiseLike<{ count: number | null }>,
): Promise<number> {
  try {
    const r = await p;
    return r.count ?? 0;
  } catch {
    return 0;
  }
}

export async function getPressIngestTierStats(): Promise<PressIngestTierStats> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [w24High, w24Mid, l24High, l24Mid, w7High, w7Mid, l7High, l7Mid] =
    await Promise.all([
      safe(
        admin
          .from("welfare_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "high")
          .gte("auto_confirmed_at", since24h),
      ),
      safe(
        admin
          .from("welfare_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "mid")
          .gte("auto_confirmed_at", since24h),
      ),
      safe(
        admin
          .from("loan_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "high")
          .gte("auto_confirmed_at", since24h),
      ),
      safe(
        admin
          .from("loan_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "mid")
          .gte("auto_confirmed_at", since24h),
      ),
      safe(
        admin
          .from("welfare_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "high")
          .gte("auto_confirmed_at", since7d),
      ),
      safe(
        admin
          .from("welfare_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "mid")
          .gte("auto_confirmed_at", since7d),
      ),
      safe(
        admin
          .from("loan_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "high")
          .gte("auto_confirmed_at", since7d),
      ),
      safe(
        admin
          .from("loan_programs")
          .select("id", { count: "exact", head: true })
          .eq("auto_confirm_tier", "mid")
          .gte("auto_confirmed_at", since7d),
      ),
    ]);

  const highCount24h = w24High + l24High;
  const midCount24h = w24Mid + l24Mid;
  const autoConfirm24h = highCount24h + midCount24h;
  const highCount7d = w7High + l7High;
  const midCount7d = w7Mid + l7Mid;
  const autoConfirm7d = highCount7d + midCount7d;

  const [revoke24h, revoke7d] = await Promise.all([
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_auto_revoke")
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_auto_revoke")
        .gte("created_at", since7d),
    ),
  ]);

  // mid 회수율 (7d) — details.auto_confirm_tier='mid' 만 카운트
  let midRevoke7d = 0;
  try {
    const { data } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "press_l2_auto_revoke")
      .gte("created_at", since7d);
    midRevoke7d = (data ?? []).filter(
      (r) =>
        (r as { details?: { auto_confirm_tier?: string } | null }).details
          ?.auto_confirm_tier === "mid",
    ).length;
  } catch {
    midRevoke7d = 0;
  }
  const midRevokeRate7d =
    midCount7d > 0 ? Math.round((midRevoke7d / midCount7d) * 100) : 0;
  const revokeRate7d =
    autoConfirm7d > 0 ? Math.round((revoke7d / autoConfirm7d) * 100) : 0;

  const [lowQueue, pressPending, newsBacklog] = await Promise.all([
    safe(
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("confidence_tier", "low"),
    ),
    safe(
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),
    safe(
      admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .is("classified_at", null)
        .eq("is_hidden", false),
    ),
  ]);

  const [lowConfirmed7d, lowRejected7d] = await Promise.all([
    safe(
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "low")
        .eq("status", "confirmed")
        .gte("created_at", since7d),
    ),
    safe(
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("confidence_tier", "low")
        .eq("status", "rejected")
        .gte("created_at", since7d),
    ),
  ]);
  const lowDecided7d = lowConfirmed7d + lowRejected7d;
  const lowConfirmRate7d =
    lowDecided7d > 0 ? Math.round((lowConfirmed7d / lowDecided7d) * 100) : 0;
  // 자동 추천 hint — AUTO_CONFIRM_TIER_FLOOR 튜닝 결정 가속
  const lowConfirmRateHint =
    lowDecided7d < 5
      ? "데이터 부족"
      : lowConfirmRate7d > 50
        ? "LLM 보수적 — AUTO_CONFIRM_TIER_FLOOR=low 검토"
        : lowConfirmRate7d < 30
          ? "LLM 정확 — 현 상태 유지"
          : "관찰 중";

  const midRevokeRateWarning = midRevokeRate7d > 5;

  return {
    timestamp: new Date().toISOString(),
    autoConfirm24h,
    highCount24h,
    midCount24h,
    autoConfirm7d,
    highCount7d,
    midCount7d,
    autoRevoke24h: revoke24h,
    autoRevoke7d: revoke7d,
    revokeRate7d,
    midRevokeRate7d,
    midRevokeRateWarning,
    pressLowTierBacklog: lowQueue,
    pressPending,
    newsBacklog,
    lowConfirmed7d,
    lowRejected7d,
    lowConfirmRate7d,
    lowConfirmRateHint,
  };
}
