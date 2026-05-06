// lib/personalization/diagnostic.ts
// ============================================================
// 추천 시스템 진단 — 단일 정책에 대한 score + 차단 사유 분류
// ============================================================
// /admin/recommendation-trace 어드민 페이지 전용. score.ts 의 scoreProgram
// 결과를 그대로 사용 + signals 분석으로 BlockReason 분류.
// score.ts 로직 변경 X (read-only 진단).
// ============================================================

import {
  scoreProgram,
  detectCohortMismatch,
  buildProgramText,
  REGION_ALIASES,
  type ScorableItem,
  type CohortKind,
} from "./score";
import { evaluateBusinessMatch } from "@/lib/eligibility/business-match";
import type { UserSignals, MatchSignal } from "./types";

// score.ts 의 CohortKind 를 진단 도구 외부에서도 쓸 수 있게 re-export
export type { CohortKind };

export type BlockReason =
  | "shown"             // score >= minScore, 노출됨
  | "below_min_score"   // score 1 이상이지만 minScore 미만
  | "no_signal"         // score 0 + 차단 사유 없음 (단순 매칭 신호 없음)
  | "cohort_mismatch"   // 본문 substring cohort 차단
  | "regional_gate"     // 광역 mismatch 로 강제 차단
  | "household_gate"    // household_target_tags 와 user.householdTypes 교집합 0
  | "business_mismatch" // business 자격 미달 강제 차단
  | "income_gate";      // income_target_level 미달

export type ScoreTrace = {
  programId: string;
  programTitle: string;
  score: number;
  signals: MatchSignal[];
  blockReason: BlockReason;
  programRegion: string | null;
  programHouseholdTags: string[] | null;
  programBenefitTags: string[];
  // cohort_mismatch 일 때만 ~120자 발췌 (false positive 의심 시 사장님 추적용)
  excerptForCohort: string | null;
  // cohort_mismatch 일 때만 어떤 cohort gate 가 트리거됐는지 (16 종 중 하나)
  // 옵션 B (cohort gate 재설계) 의 우선순위 결정용
  cohortKind: CohortKind | null;
};

export type TraceSummary = {
  total: number;
  shown: number;
  blocked: Record<BlockReason, number>;
  scoreDistribution: { bucket: string; count: number }[];
  // cohort_mismatch 분포 — 어떤 cohort gate 가 가장 자주 트리거됐는지
  // 0 인 cohort 는 생략. 정렬: 카운트 내림차순.
  cohortBreakdown: { kind: CohortKind; count: number }[];
};

const SCORE_BUCKETS: { label: string; test: (score: number) => boolean }[] = [
  { label: "0", test: (s) => s === 0 },
  { label: "1-3", test: (s) => s >= 1 && s <= 3 },
  { label: "4-7", test: (s) => s >= 4 && s <= 7 },
  { label: "8+", test: (s) => s >= 8 },
];

/**
 * 단일 정책 trace — scoreProgram 결과 + 차단 사유 분류.
 *
 * 차단 분기 우선순위 (score.ts 의 scoreProgram 내부 순서와 동일):
 *   1. cohort_mismatch (본문 substring)
 *   2. income_gate (income_target_level)
 *   3. regional_gate (program.region 있음 + user.region 있음 + 광역 mismatch)
 *   4. household_gate (household_target_tags 명시 + user householdTypes 명시 + 교집합 0)
 *   5. business_mismatch (signals 분석으로 추정)
 *   6. below_min_score / no_signal / shown
 */
export function traceScore<T extends ScorableItem>(
  program: T,
  user: UserSignals,
  minScore: number,
): ScoreTrace {
  const haystack = buildProgramText(program);

  // ⓪ Cohort mismatch 사전 판별 — 어떤 cohort 인지도 함께 식별
  const cohortKind = detectCohortMismatch(haystack, user);
  if (cohortKind !== null) {
    return {
      programId: program.id,
      programTitle: program.title,
      score: 0,
      signals: [],
      blockReason: "cohort_mismatch",
      programRegion: program.region ?? null,
      programHouseholdTags: program.household_target_tags ?? null,
      programBenefitTags: program.benefit_tags ?? [],
      excerptForCohort: extractCohortExcerpt(haystack),
      cohortKind,
    };
  }

  // 실제 score 평가 — score.ts 의 scoreProgram 호출 (변경 X)
  const result = scoreProgram(program, user);

  // score=0 + signals=[] 면 어떤 gate 에서 강제 차단된 것
  // score.ts 의 차단 분기 순서와 동일하게 우선순위 평가
  if (result.score === 0 && result.signals.length === 0) {
    // income_gate
    if (program.income_target_level && user.incomeLevel) {
      const programLevel = program.income_target_level;
      if (programLevel !== "any" && programLevel !== user.incomeLevel) {
        return makeBlocked(program, "income_gate");
      }
    }
    // regional_gate
    if (program.region && user.region) {
      if (!regionMatch(program.region, user.region)) {
        return makeBlocked(program, "regional_gate");
      }
    }
    // household_gate
    if (
      program.household_target_tags &&
      program.household_target_tags.length > 0 &&
      user.householdTypes.length > 0
    ) {
      const overlap = user.householdTypes.filter((ht) =>
        program.household_target_tags!.includes(ht),
      );
      if (overlap.length === 0) {
        return makeBlocked(program, "household_gate");
      }
    }
    // business_mismatch — score.ts 와 동일하게 evaluateBusinessMatch === 'mismatch' 만
    if (user.businessProfile) {
      const result = evaluateBusinessMatch(haystack, user.businessProfile);
      if (result === "mismatch") {
        return makeBlocked(program, "business_mismatch");
      }
    }
    // 위 어느 게이트도 트리거 안 했지만 score=0 + signals=[] →
    // 정책에 매칭 신호 없음 (region NULL, benefit_tags 빈 배열, 본문 키워드 0)
    return makeBlocked(program, "no_signal");
  }

  // score 가 1+ 이면 minScore 비교
  const blockReason: BlockReason =
    result.score >= minScore ? "shown" : "below_min_score";

  return {
    programId: program.id,
    programTitle: program.title,
    score: result.score,
    signals: result.signals,
    blockReason,
    programRegion: program.region ?? null,
    programHouseholdTags: program.household_target_tags ?? null,
    programBenefitTags: program.benefit_tags ?? [],
    excerptForCohort: null,
    cohortKind: null,
  };
}

function makeBlocked<T extends ScorableItem>(
  program: T,
  reason: BlockReason,
): ScoreTrace {
  return {
    programId: program.id,
    programTitle: program.title,
    score: 0,
    signals: [],
    blockReason: reason,
    programRegion: program.region ?? null,
    programHouseholdTags: program.household_target_tags ?? null,
    programBenefitTags: program.benefit_tags ?? [],
    excerptForCohort: null,
    cohortKind: null,
  };
}

// 사용자 region 별칭 매칭 — score.ts 의 REGION_ALIASES 사용해 production 과 일관성
// 예: user.region="전북" → ["전북", "전라북도", "전북특별자치도"] 중 하나라도
// program.region 에 포함되면 매칭 성공.
function regionMatch(programRegion: string, userRegion: string): boolean {
  if (programRegion.includes("전국")) return true;
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  return aliases.some((a) => programRegion.includes(a));
}

// cohort 차단 사유의 본문 발췌 (~120자) — false positive 추적용
// 사용자 cohort 와 충돌 가능성 높은 키워드 위치 좌우 ~60자 발췌. 실패 시 첫 120자.
function extractCohortExcerpt(haystack: string): string {
  const trimmed = haystack.trim();
  if (trimmed.length <= 120) return trimmed;
  const keywords = [
    "여성", "청년", "노인", "학생", "장애", "한부모",
    "다자녀", "기초", "수급", "보훈", "농어",
  ];
  for (const k of keywords) {
    const idx = trimmed.indexOf(k);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(trimmed.length, idx + 80);
      return (
        (start > 0 ? "..." : "") +
        trimmed.slice(start, end) +
        (end < trimmed.length ? "..." : "")
      );
    }
  }
  return trimmed.slice(0, 120) + "...";
}

/**
 * trace 배열을 받아 차단 사유별 합계 + 점수 분포 4 bucket + cohort breakdown 반환.
 */
export function summarizeTrace(traces: ScoreTrace[]): TraceSummary {
  const blocked: Record<BlockReason, number> = {
    shown: 0,
    below_min_score: 0,
    no_signal: 0,
    cohort_mismatch: 0,
    regional_gate: 0,
    household_gate: 0,
    business_mismatch: 0,
    income_gate: 0,
  };

  // cohort 별 차단 카운트 — cohort_mismatch 인 trace 만 집계
  const cohortCounts = new Map<CohortKind, number>();

  for (const t of traces) {
    blocked[t.blockReason] = (blocked[t.blockReason] ?? 0) + 1;
    if (t.cohortKind !== null) {
      cohortCounts.set(t.cohortKind, (cohortCounts.get(t.cohortKind) ?? 0) + 1);
    }
  }

  const shown = blocked.shown;
  const blockedOnly: Record<BlockReason, number> = { ...blocked, shown: 0 };

  const scoreDistribution = SCORE_BUCKETS.map((b) => ({
    bucket: b.label,
    count: traces.filter((t) => b.test(t.score)).length,
  }));

  // 카운트 내림차순 정렬 — false positive 큰 cohort 가 위로
  const cohortBreakdown = Array.from(cohortCounts.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: traces.length,
    shown,
    blocked: blockedOnly,
    scoreDistribution,
    cohortBreakdown,
  };
}
