// ============================================================
// Codex W0 → W1 ramp-up 검증 (2026-05-25 시점 자동)
// ============================================================
// spec: docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md
//
// W0 1주 가동 후 W1 활성화 적합성 자동 측정:
// - 7일 agent_diagnose_run 누적 ≥ 800 (의도 480×7=3360 의 약 24%, 안전 threshold)
// - unique_questions = 10 (모든 question dispatch)
// - errors < 5%
//
// PendingExternalActionsCard 자동 표시 — 5/25 이후 + 임계 충족 시.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type W1ReadinessResult = {
  /** 5/25 이전이면 false (아직 검증 시점 X) */
  windowReached: boolean;
  /** 7일 agent_diagnose_run 누적 */
  totalRuns7d: number;
  /** unique question dispatch 수 */
  uniqueQuestions: number;
  /** errors 비율 (0~1) */
  errorRate: number;
  /** 임계 모두 충족 = W1 활성화 권장 */
  ready: boolean;
  /** 미충족 사유 (사장님 reminder 메시지용) */
  reasons: string[];
  /** 5/25 까지 남은 일 수 (음수 = 지난 날짜) */
  daysToWindow: number;
  /** totalRuns/임계 진척률 (0~1, ≥1 = 충족) — 가시화용 */
  progressTotalRuns: number;
  /** uniqueQuestions/임계 진척률 */
  progressUniqueQuestions: number;
  /** errorRate 안정성 (1 - rate/threshold, 0~1) — 1 = 안정 */
  progressErrorRate: number;
  /** 임계 상수 (UI 라벨용) */
  thresholds: {
    totalRuns: number;
    uniqueQuestions: number;
    errorRate: number;
  };
};

const W1_THRESHOLD_TOTAL_RUNS = 800;
const W1_THRESHOLD_UNIQUE_QUESTIONS = 10;
const W1_THRESHOLD_ERROR_RATE = 0.05;
const W1_WINDOW_START = new Date("2026-05-25T00:00:00+09:00");

export async function checkW1Readiness(): Promise<W1ReadinessResult> {
  const windowReached = Date.now() >= W1_WINDOW_START.getTime();
  const daysToWindow = Math.ceil(
    (W1_WINDOW_START.getTime() - Date.now()) / (24 * 3600_000),
  );

  // 2026-05-19 — windowReached=false 일 때도 measurement 진행 (early return 폐기).
  // 사장님이 5/25 까지의 진척률 미리 가시화. reminder 발동 조건은 호출 측에서 분리.
  try {
    const admin = createAdminClient();
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: runs, error } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "agent_diagnose_run")
      .gte("created_at", since7d);
    if (error || !runs) {
      return emptyResult({
        windowReached,
        daysToWindow,
        reasons: [`DB 조회 실패: ${error?.message ?? "unknown"}`],
      });
    }

    const total = runs.length;
    const questions = new Set<string>();
    let errors = 0;
    for (const r of runs) {
      const d = r.details as { question?: string; error?: string } | null;
      if (d?.question) questions.add(d.question);
      if (d?.error) errors++;
    }
    const errorRate = total > 0 ? errors / total : 0;

    const reasons: string[] = [];
    if (total < W1_THRESHOLD_TOTAL_RUNS) {
      reasons.push(`7일 누적 ${total}건 < 임계 ${W1_THRESHOLD_TOTAL_RUNS}건`);
    }
    if (questions.size < W1_THRESHOLD_UNIQUE_QUESTIONS) {
      reasons.push(`unique question ${questions.size} < ${W1_THRESHOLD_UNIQUE_QUESTIONS}`);
    }
    if (errorRate >= W1_THRESHOLD_ERROR_RATE) {
      reasons.push(`error rate ${(errorRate * 100).toFixed(1)}% ≥ ${(W1_THRESHOLD_ERROR_RATE * 100).toFixed(1)}%`);
    }

    // 진척률 계산 (시각화용). errorRate 는 안정성 점수 = 1 - rate/threshold.
    const progressTotalRuns = Math.min(1, total / W1_THRESHOLD_TOTAL_RUNS);
    const progressUniqueQuestions = Math.min(
      1,
      questions.size / W1_THRESHOLD_UNIQUE_QUESTIONS,
    );
    const progressErrorRate =
      errorRate >= W1_THRESHOLD_ERROR_RATE
        ? 0
        : 1 - errorRate / W1_THRESHOLD_ERROR_RATE;

    return {
      windowReached,
      totalRuns7d: total,
      uniqueQuestions: questions.size,
      errorRate,
      ready: windowReached && reasons.length === 0,
      reasons,
      daysToWindow,
      progressTotalRuns,
      progressUniqueQuestions,
      progressErrorRate,
      thresholds: {
        totalRuns: W1_THRESHOLD_TOTAL_RUNS,
        uniqueQuestions: W1_THRESHOLD_UNIQUE_QUESTIONS,
        errorRate: W1_THRESHOLD_ERROR_RATE,
      },
    };
  } catch (e) {
    return emptyResult({
      windowReached,
      daysToWindow,
      reasons: [`exception: ${(e as Error).message}`],
    });
  }
}

function emptyResult(input: {
  windowReached: boolean;
  daysToWindow: number;
  reasons: string[];
}): W1ReadinessResult {
  return {
    windowReached: input.windowReached,
    totalRuns7d: 0,
    uniqueQuestions: 0,
    errorRate: 0,
    ready: false,
    reasons: input.reasons,
    daysToWindow: input.daysToWindow,
    progressTotalRuns: 0,
    progressUniqueQuestions: 0,
    progressErrorRate: 0,
    thresholds: {
      totalRuns: W1_THRESHOLD_TOTAL_RUNS,
      uniqueQuestions: W1_THRESHOLD_UNIQUE_QUESTIONS,
      errorRate: W1_THRESHOLD_ERROR_RATE,
    },
  };
}
