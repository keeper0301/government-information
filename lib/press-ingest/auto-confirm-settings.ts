// ============================================================
// press_auto_confirm_settings 학습값 조회 (Spec 1 자가 진화 학습)
// ============================================================
// `/api/cron/press-confidence-tune` 가 매주 월 02:00 KST 측정 후
// press_auto_confirm_settings 에 새 row insert. 이 함수가 최신 active
// 설정 (effective_from DESC 최상단) 을 5분 cache 로 조회한다.
//
// 우선순위 (안전 가드):
//   1. process.env.AUTO_CONFIRM_TIER_FLOOR — 긴급 override (재배포 즉시 반영)
//   2. DB 학습값 — 자가 진화 결과
//   3. 'high' default — 가장 보수적, DB / env 모두 실패 시
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type TierFloor = "high" | "mid" | "low";

const VALID_TIERS = ["high", "mid", "low"] as const;
const CACHE_TTL_MS = 5 * 60 * 1000;

let _cache: { tier_floor: TierFloor; expiresAt: number } | null = null;

// env 값이 유효한 TierFloor 인지 확인
function parseEnvTier(raw: string | undefined): TierFloor | null {
  if (!raw) return null;
  return VALID_TIERS.includes(raw as TierFloor) ? (raw as TierFloor) : null;
}

// 현재 active tier_floor — env > DB > 'high'
export async function getCurrentTierFloor(): Promise<TierFloor> {
  // 1순위: env (긴급 override)
  const envTier = parseEnvTier(process.env.AUTO_CONFIRM_TIER_FLOOR);
  if (envTier) return envTier;

  // 2순위: DB (5분 cache)
  if (_cache && _cache.expiresAt > Date.now()) return _cache.tier_floor;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("press_auto_confirm_settings")
      .select("tier_floor")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.tier_floor && VALID_TIERS.includes(data.tier_floor as TierFloor)) {
      _cache = {
        tier_floor: data.tier_floor as TierFloor,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      return data.tier_floor as TierFloor;
    }
  } catch (err) {
    // DB 실패는 silent — 'high' default 로 fallback. 운영 안전 우선.
    console.error("[auto-confirm-settings] DB error:", err);
  }

  // 3순위: default
  return "high";
}

// test 전용 — cache reset
export function _resetTierFloorCache(): void {
  _cache = null;
}
