// ============================================================
// 네이버 블로그 큐 적체 alert
// ============================================================
// 매일 KST 09:10 cron 에서 호출. 큐가 임계치 이상 쌓이면 사장님 휴대폰으로
// SMS 즉시 알림 → 사장님이 PC 켤 때 클로드한테 일괄 발행 부탁 → 5분 처리.
//
// 설계:
//   - 임계치 3건 — 3일 이상 안 비울 때만 알림 (매일 알림 부담 ↓)
//   - 2026-05-17 G9: SMS → SMS + 텔레그램 multichannel (Solapi balance 0 사고 대비)
//   - 환경변수 미설정 시 skipped (운영 단계 보호)
//
// 호출처: app/api/cron/naver-queue-alert/route.ts
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOpsAlertMultichannel,
  type MultichannelResult,
} from "@/lib/notifications/ops-alert-multichannel";

// 알림 임계치 — pending 큐가 이 값 이상이면 SMS 발송.
const QUEUE_THRESHOLD = 3;

export type NaverQueueAlertResult = {
  pendingCount: number;
  threshold: number;
  sent: boolean;
  reason?: "below_threshold" | "skipped_no_credentials" | "skipped_disabled" | "invalid_phone" | "api_error" | "network_error";
  multiResult?: MultichannelResult;
};

/**
 * pending 큐 카운트 조회 후 임계치 이상이면 사장님 SMS 발송.
 *
 * 큐가 적체되는 시나리오:
 *   - 사장님 PC 며칠 못 켜는 경우 (출장·휴가)
 *   - 매일 1글 발행 + 사장님 발행 안 하면 누적
 */
export async function checkAndAlertNaverQueue(): Promise<NaverQueueAlertResult> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("naver_blog_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    return {
      pendingCount: 0,
      threshold: QUEUE_THRESHOLD,
      sent: false,
      reason: "api_error",
    };
  }

  const pendingCount = count ?? 0;
  if (pendingCount < QUEUE_THRESHOLD) {
    return {
      pendingCount,
      threshold: QUEUE_THRESHOLD,
      sent: false,
      reason: "below_threshold",
    };
  }

  // SMS + 텔레그램 동시 발송 (G9). SMS 본문 약 100자 (LMS 전환 ~30원/건).
  // 임계치 미달 시 미발송이라 월 비용 영향 미미.
  const multi = await sendOpsAlertMultichannel({
    subject: `[keepioo] 네이버 큐 ${pendingCount}건 대기`,
    message: `PC 켤 때 클로드한테 "naver-blog 큐 일괄 발행해줘" 라고 말씀하시면 5분 안에 정리됩니다.`,
    link: "keepioo.com/admin/naver-blog",
  });

  // 1 채널 이상 도달 시 sent=true. SMS 만 보면 Solapi 0 사고에서 false 표시되어 부정확.
  return {
    pendingCount,
    threshold: QUEUE_THRESHOLD,
    sent: multi.anyDelivered,
    reason: multi.anyDelivered
      ? undefined
      : (multi.sms?.ok === false ? multi.sms.reason : "api_error"),
    multiResult: multi,
  };
}
