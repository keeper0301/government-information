// ============================================================
// press tier_floor 학습 — 측정값 → 결정 (순수 로직)
// ============================================================
// press-confidence-tune cron 의 decide() 를 route 밖으로 분리.
// (Next.js route 파일은 HTTP 핸들러 외 임의 export 불가 + 단위 테스트 위해)
// measure()(DB 측정) 는 route 에 남고, 여기는 순수 결정 로직만 둔다.
// ============================================================

import type { TierFloor } from "@/lib/press-ingest/auto-confirm-settings";

const TIER_RANK: Record<TierFloor, number> = { high: 3, mid: 2, low: 1 };
const MID_REVOKE_DANGER_PCT = 5;
const LOW_CONFIRM_EXPAND_PCT = 50;
const MIN_MID_DECIDED = 10;
const MIN_LOW_DECIDED = 5;

export type Measurement = {
  midRevokedCount: number;
  midDecidedCount: number;
  midRevokeRatePct: number;
  lowConfirmedCount: number;
  lowDecidedCount: number;
  lowConfirmRatePct: number;
};

// 적극 방향 1단계 cap. 보수 방향은 즉시 변경.
function stepTowards(current: TierFloor, target: TierFloor): TierFloor {
  if (TIER_RANK[target] >= TIER_RANK[current]) {
    // 보수적 방향 (또는 동일) — 즉시 변경
    return target;
  }
  // 적극적 방향 (high→mid, mid→low) — 1단계만
  const stepRank = TIER_RANK[current] - 1;
  if (stepRank === 2) return "mid";
  if (stepRank === 1) return "low";
  return current;
}

export function decide(current: TierFloor, m: Measurement): {
  target: TierFloor;
  next: TierFloor;
  reason: string;
  sufficient: boolean;
} {
  const sufficient =
    m.midDecidedCount >= MIN_MID_DECIDED || m.lowDecidedCount >= MIN_LOW_DECIDED;

  if (!sufficient) {
    return {
      target: current,
      next: current,
      reason: `데이터 부족 — mid_decided ${m.midDecidedCount} (<${MIN_MID_DECIDED}) AND low_decided ${m.lowDecidedCount} (<${MIN_LOW_DECIDED}). 현재 floor='${current}' 유지.`,
      sufficient: false,
    };
  }

  // 1순위: mid 회수율 > 5% → 'high' (안전 강화)
  if (m.midDecidedCount >= MIN_MID_DECIDED && m.midRevokeRatePct > MID_REVOKE_DANGER_PCT) {
    const next = stepTowards(current, "high");
    return {
      target: "high",
      next,
      reason: `mid 회수율 ${m.midRevokeRatePct}% (>${MID_REVOKE_DANGER_PCT}%) — high 안전 모드. ${current} → ${next}`,
      sufficient: true,
    };
  }

  // 2순위: low_confirm_rate > 50% → 'low' (확장, 1단계 cap)
  if (m.lowDecidedCount >= MIN_LOW_DECIDED && m.lowConfirmRatePct > LOW_CONFIRM_EXPAND_PCT) {
    const next = stepTowards(current, "low");
    return {
      target: "low",
      next,
      reason: `low confirm 비율 ${m.lowConfirmRatePct}% (>${LOW_CONFIRM_EXPAND_PCT}%) — low 확장. ${current} → ${next} (1단계 cap)`,
      sufficient: true,
    };
  }

  // 3순위: 그 외 → 'mid' (default 적극)
  // 단, high→mid 완화는 mid tier 자동 confirm 안전성을 검증할 mid 표본이 충분할
  // 때만 허용한다(코드리뷰 P1 2026-06-08). mid_decided=0 인데 low 표본만으로 완화하면
  // 검증되지 않은 mid 자동 confirm 게이트가 열려 오게시 위험이 커진다.
  // (강화 방향 low→mid 는 보수적이므로 가드 불필요)
  const wouldRelaxToMid = TIER_RANK["mid"] < TIER_RANK[current]; // high → mid
  if (wouldRelaxToMid && m.midDecidedCount < MIN_MID_DECIDED) {
    return {
      target: current,
      next: current,
      reason: `mid 완화 보류 — mid_decided ${m.midDecidedCount} (<${MIN_MID_DECIDED}) 로 mid tier 검증 불충분. 현재 floor='${current}' 유지.`,
      sufficient: true,
    };
  }

  const next = stepTowards(current, "mid");
  return {
    target: "mid",
    next,
    reason: `mid 회수율 ${m.midRevokeRatePct}% (안전) + low confirm ${m.lowConfirmRatePct}% (확장 부족) — mid default. ${current} → ${next}`,
    sufficient: true,
  };
}
