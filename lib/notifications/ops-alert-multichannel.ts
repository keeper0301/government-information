// ============================================================
// sendOpsAlertMultichannel — SMS + 텔레그램 동시 발송 (운영 alert 다중 채널)
// ============================================================
// 사용처: app/api/cron/health-alert + external-console-check (2026-05-14 기준).
//
// 목적: 단일 진입점으로 multi-channel 발송. 새 채널 (이메일·디스코드·슬랙 등)
// 추가 시에도 호출자는 1줄 (`sendOpsAlertMultichannel`) 만 사용.
//
// 메타 안전책 사고 (5/9~5/14): SMS (Solapi) 단일 채널 → 잔액 0 5일 다운.
// 텔레그램 fallback (commit f6ad1ef + 21a590b) 도입 후 2 cron 모두 양 채널.
// 이 helper 가 그 패턴을 단일화.
//
// ChannelResult — 각 채널별 결과를 호출자가 audit 에 그대로 기록 가능 (key/reason/error).
// ============================================================

import {
  sendOpsAlertSms,
  type OpsAlertSmsResult,
} from "./sms-ops-alert";
import {
  sendOpsAlertTelegram,
  type OpsAlertTelegramResult,
} from "./telegram-ops-alert";

export interface MultichannelResult {
  /** 1 채널이라도 도달했으면 true (모든 채널 실패만 false). */
  anyDelivered: boolean;
  sms: OpsAlertSmsResult | null;
  telegram: OpsAlertTelegramResult | null;
}

/**
 * SMS + 텔레그램 동시 발송 (병렬).
 *
 * - 한 채널이 throw 해도 다른 채널 진행 (Promise.allSettled 패턴).
 * - SMS 가 잔액 0 등으로 실패해도 텔레그램으로 도달 보장 (메타 안전책).
 * - link 미지정 시 SMS 본문 끝에 admin/health 기본 안내 (sms-ops-alert 의 기본값).
 *
 * @param subject  알림 제목 (예: "[keepioo 운영] 3건 임계치 초과")
 * @param message  본문 (alerts message join, recommendation 포함)
 * @param link     SMS 본문 끝 link (선택, 빈 문자열이면 link 라인 자체 skip)
 */
export async function sendOpsAlertMultichannel({
  subject,
  message,
  link,
}: {
  subject: string;
  message: string;
  link?: string;
}): Promise<MultichannelResult> {
  // 병렬 발송 — 한 채널 latency 가 다른 채널 막지 않음.
  // 각 sender 가 자체 try/catch 하므로 throw 거의 없으나, network_error 안전망.
  const [smsSettled, telegramSettled] = await Promise.allSettled([
    sendOpsAlertSms({ subject, message, link }),
    sendOpsAlertTelegram({ subject, message }),
  ]);

  const sms: OpsAlertSmsResult | null =
    smsSettled.status === "fulfilled"
      ? smsSettled.value
      : { ok: false, reason: "network_error", error: (smsSettled.reason as Error).message };

  const telegram: OpsAlertTelegramResult | null =
    telegramSettled.status === "fulfilled"
      ? telegramSettled.value
      : { ok: false, reason: "network_error", error: (telegramSettled.reason as Error).message };

  // 1 채널이라도 도달하면 anyDelivered=true (메타 안전책 보장 명시).
  const anyDelivered = (sms?.ok ?? false) || (telegram?.ok ?? false);

  return { anyDelivered, sms, telegram };
}
