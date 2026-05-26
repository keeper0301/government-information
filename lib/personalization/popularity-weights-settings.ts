// ============================================================
// popularity_weights_history 학습값 조회 (Spec 2 자가 진화 학습)
// ============================================================
// `/api/cron/popularity-weights-tune` 가 매주 월 02:30 KST 측정 후
// popularity_weights_history 에 새 row insert. 이 함수가 최신 active
// 가중치 (effective_from DESC 최상단) 를 5분 cache 로 조회.
//
// 우선순위:
//   1. DB 학습값 — 자가 진화 결과
//   2. POPULARITY_WEIGHTS_DEFAULT (회귀 가드)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type PopularityWeights = {
  viewWeight: number;
  applyWeight: number;
  maxBoost: number;
};

// hardcode default — DB 미가용 fallback. 2026-05-17 A 12차 hardcode 그대로.
export const POPULARITY_WEIGHTS_DEFAULT: PopularityWeights = {
  viewWeight: 0.5,
  applyWeight: 2,
  maxBoost: 5,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
// DB 실패 시 짧은 negative cache — popularity-boost.ts 와 동일 30초.
// DB 5분 다운 시 매 호출 재시도 폭주 차단 + 30초 후 자동 자가치유.
const NEGATIVE_TTL_MS = 30 * 1000;
let _cache: { weights: PopularityWeights; expiresAt: number } | null = null;

export async function loadCurrentWeights(): Promise<PopularityWeights> {
  // cache hit (positive 5분 / negative 30초)
  if (_cache && _cache.expiresAt > Date.now()) return _cache.weights;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("popularity_weights_history")
      .select("view_weight, apply_weight, max_boost")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const weights: PopularityWeights = {
        viewWeight: Number(data.view_weight),
        applyWeight: Number(data.apply_weight),
        maxBoost: Number(data.max_boost),
      };
      // 숫자 검증 — NaN/0 cap 차단 (broken row 가 service 마비시키지 않도록)
      if (
        Number.isFinite(weights.viewWeight) &&
        Number.isFinite(weights.applyWeight) &&
        Number.isFinite(weights.maxBoost) &&
        weights.maxBoost > 0
      ) {
        _cache = { weights, expiresAt: Date.now() + CACHE_TTL_MS };
        return weights;
      }
    }
  } catch (err) {
    console.error("[popularity-weights-settings] DB error:", err);
  }

  // DB 실패 / 없음 — default fallback + negative cache (30초 폭주 차단)
  _cache = {
    weights: POPULARITY_WEIGHTS_DEFAULT,
    expiresAt: Date.now() + NEGATIVE_TTL_MS,
  };
  return POPULARITY_WEIGHTS_DEFAULT;
}

// test 전용
export function _resetWeightsCache(): void {
  _cache = null;
}
