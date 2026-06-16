// ============================================================
// 텔레그램 봇 /selflearning 명령 — 자가 진화 학습 결과 즉시 확인 (2026-05-27)
// ============================================================
// self-learning-digest cron (매주 월 03:30 KST) 의 buildDigest() 재사용.
// 사장님 cron 사이클 안 기다리고 즉시 학습 상태 확인 가능.
//
// 사용 시점:
//   - 학습 cron 가동 직후 결과 즉시 검증
//   - 진동 의심 시 latest history 빠른 확인
//   - 운영 중 hub 안 열고도 학습 상태 sanity check
// ============================================================

import { buildDigest } from "@/lib/autonomous-ops/self-learning-digest";

export async function selfLearningCommand(): Promise<string> {
  try {
    const digest = await buildDigest();
    return digest;
  } catch (err) {
    return `❌ digest fetch 실패: ${(err as Error).message}`;
  }
}
