// ============================================================
// alert_deliveries 기록 정책
// ============================================================
// alert_deliveries 는 UNIQUE(rule_id, program_table, program_id, channel) 로
// 같은 정책 중복 발송을 막는 원장이다. 따라서 일시적인 사유로 보류된 알림까지
// 기록하면 이후 정상 조건이 되어도 재시도할 수 없다.
//
// terminal = 이후 같은 정책/규칙/채널을 다시 보내면 안 되는 상태
// transient = 환경/시간/동의가 나중에 바뀌면 다시 시도해야 하는 상태
// ============================================================

const TRANSIENT_KAKAO_SKIP_ERRORS = new Set([
  "consent_missing",
  "quiet_hours_kst",
  "kakao_provider_not_configured",
]);

export function isTransientKakaoSkip(error: string | null | undefined): boolean {
  return !!error && TRANSIENT_KAKAO_SKIP_ERRORS.has(error);
}

export function shouldRecordAlertDelivery(input: {
  channel: string;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
}): boolean {
  if (input.channel !== "kakao") return true;
  if (input.status !== "skipped") return true;
  return !isTransientKakaoSkip(input.error);
}
