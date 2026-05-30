// ============================================================
// AdSense Phase B deployment 결과 텔레그램 helper (Critical #2 통합)
// ============================================================
// 2026-05-31. webhook(vercel-deployment) + polling cron(adsense-deployment-poll)
// 양쪽이 호출하는 공통 헬퍼. 메시지 통일 + dedup audit insert + 텔레그램 발화를
// 한 곳에서 책임 → DRY + 메시지 자동 통일 + dedup 비대칭 해소(webhook 도 자동
// resolved insert).
//
// 사용자: webhook handler + polling cron 둘 다.
// ============================================================

import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { logAdminAction } from "@/lib/admin-actions";

// Vercel deployments page 직접 link — 사장님 1-tap 도달 (리뷰어 minor #2).
const DEPLOYMENTS_PAGE =
  "https://vercel.com/keeper0301-8938s-projects/government-information/deployments";

export type DeploymentResolution = {
  deploymentId: string;
  state: "READY" | "ERROR" | "CANCELED" | string;
  url?: string;
};

export async function notifyAdsenseDeploymentResult(
  r: DeploymentResolution,
): Promise<void> {
  const isReady = r.state === "READY";
  const subject = isReady
    ? "✅ AdSense 광고 가동 시작"
    : "⚠️ AdSense redeploy 실패 (수동 확인 필요)";
  const message = isReady
    ? [
        `AdSense Phase B redeploy 완료 — production build 성공.`,
        ``,
        `사이트 광고 게재 가동 시작. sitemap selective 가 ai_commentary 채워진 news 진입 → Google 색인 점진 ramp-up.`,
        r.url ? `deployment: https://${r.url}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `AdSense Phase B redeploy 실패 (state=${r.state}).`,
        ``,
        `사장님 액션:`,
        `1. ${DEPLOYMENTS_PAGE} 에서 실패 사유 확인`,
        `2. Vercel env NEXT_PUBLIC_ADSENSE_REVIEW_MODE=on 으로 복원 + 재시도`,
        r.url ? `deployment: https://${r.url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

  try {
    await sendOpsAlertTelegram({ subject, message });
  } catch {
    // 텔레그램 실패는 silent (state 변경은 이미 완료).
  }

  // dedup audit insert — webhook + polling 어느 쪽이 먼저 호출해도 같은 row 가
  // 들어가 다음 polling cron 회차에서 같은 deployment_id 가 skip 됨 (비대칭 해소).
  try {
    await logAdminAction({
      actorId: null,
      action: "adsense_deployment_state_resolved",
      details: { deployment_id: r.deploymentId, state: r.state, url: r.url },
    });
  } catch {
    // audit 실패는 silent — 텔레그램은 이미 발화. 다음 회차 중복 발화 위험 (low).
  }
}
