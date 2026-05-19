// ============================================================
// Codex W0 → W1 ramp-up 검증 (2026-05-25 시점 자동)
// ============================================================
// spec: docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md
//
// W0 1주 가동 후 W1 활성화 적합성 자동 측정:
// - 7일 agent_diagnose_run 누적 ≥ 800 (의도 432×7=3024 의 약 26%, 안전 threshold)
// - unique_questions = 9 (모든 question dispatch)
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
};

const W1_THRESHOLD_TOTAL_RUNS = 800;
const W1_THRESHOLD_UNIQUE_QUESTIONS = 9;
const W1_THRESHOLD_ERROR_RATE = 0.05;
const W1_WINDOW_START = new Date("2026-05-25T00:00:00+09:00");

export async function checkW1Readiness(): Promise<W1ReadinessResult> {
  const windowReached = Date.now() >= W1_WINDOW_START.getTime();

  // 5/25 이전이면 measurement 무의미 — early return
  if (!windowReached) {
    return {
      windowReached: false,
      totalRuns7d: 0,
      uniqueQuestions: 0,
      errorRate: 0,
      ready: false,
      reasons: [
        `검증 창 시작 전 (5/25 이후 발동). 현재 W0 가동 중.`,
      ],
    };
  }

  try {
    const admin = createAdminClient();
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: runs, error } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "agent_diagnose_run")
      .gte("created_at", since7d);
    if (error || !runs) {
      return {
        windowReached: true,
        totalRuns7d: 0,
        uniqueQuestions: 0,
        errorRate: 0,
        ready: false,
        reasons: [`DB 조회 실패: ${error?.message ?? "unknown"}`],
      };
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

    return {
      windowReached: true,
      totalRuns7d: total,
      uniqueQuestions: questions.size,
      errorRate,
      ready: reasons.length === 0,
      reasons,
    };
  } catch (e) {
    return {
      windowReached: true,
      totalRuns7d: 0,
      uniqueQuestions: 0,
      errorRate: 0,
      ready: false,
      reasons: [`exception: ${(e as Error).message}`],
    };
  }
}
