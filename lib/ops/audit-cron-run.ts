// ============================================================
// auditCronRun — cron 진입 흔적 audit helper (운영 안전성 보장)
// ============================================================
// 사용처: collect_run / press_ingest_run / alert_dispatch_run /
//        external_console_check_run 4 cron (2026-05-14 기준).
//
// 패턴: cron 본체 결과와 무관하게 admin_actions 1건 기록.
//   - audit 실패해도 cron 응답 유지 (운영 안전성 — try/catch swallow)
//   - 빈손 (처리 0건) 도 row 보장 → cron 노쇼 진단 정확도 ↑
//   - press_l2_classify 같은 "처리한 만큼만 row" false positive 차단 패턴
//
// 신규 cron 가시성 확보 시 따라할 mental model:
//   1. lib/admin-actions.ts AdminActionType 에 '<cron>_run' 추가
//   2. cron route 끝/실패 분기 모두 auditCronRun 호출 (1줄)
//   3. lib/health-check.ts 의 노쇼 임계 query 가 이 action 감지 가능하게 추가
// ============================================================

import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

/**
 * cron 진입 흔적 audit. 실패해도 throw 안 함 (운영 안전성).
 *
 * @param action  AdminActionType — '<cron>_run' 형식 권장
 * @param details cron 결과 통계 (job/총수/실패수/skipped 등 자유)
 */
export async function auditCronRun(
  action: AdminActionType,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await logAdminAction({
      actorId: null, // system actor — cron 자동 실행
      action,
      details,
    });
  } catch (e) {
    // audit 실패는 console 만, cron 응답은 유지
    console.warn(
      `[auditCronRun:${action}] admin_actions 기록 실패:`,
      (e as Error).message,
    );
  }
}
