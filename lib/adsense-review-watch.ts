export type AdSenseState =
  | "READY"
  | "NEEDS_ATTENTION"
  | "WARNING"
  | "DISABLED"
  | "CLOSED"
  | "NOT_FOUND"
  | "UNKNOWN";

// 전환별 사장님 알림 메시지 + 우선순위 분기.
export function buildTransitionAlert(input: {
  previous: AdSenseState | null;
  current: AdSenseState;
}): { shouldAlert: boolean; subject: string; message: string } | null {
  const { previous, current } = input;

  // 첫 가동 — previous 가 null 이면 audit 만, alert 안 함 (baseline 수립).
  if (previous === null) return null;

  // 동일 state — noop.
  if (previous === current) return null;

  // 승인 — READY 전환.
  if (current === "READY") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 승인 통과 🎉",
      message: [
        `AdSense 검수 결과: 승인.`,
        `account.state ${previous} → READY 전환 감지.`,
        ``,
        `[다음 액션]`,
        `1. Vercel env 에 ADSENSE_PUBLISHER_ID 등록`,
        `2. ads.txt 노출 확인 (curl https://www.keepioo.com/ads.txt)`,
        `3. /admin/external-console 의 AdSense 카드 READY 확인`,
        `4. 1주차 모니터링 (수익 누적, 광고 게재 비율)`,
      ].join("\n"),
    };
  }

  // 거절 — DISABLED/CLOSED 전환.
  if (current === "DISABLED" || current === "CLOSED") {
    return {
      shouldAlert: true,
      subject: `[keepioo] AdSense 거절 (${current})`,
      message: [
        `AdSense 검수 결과: 거절.`,
        `account.state ${previous} → ${current} 전환 감지.`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com → 사이트 keepioo.com → 거절 사유 확인`,
        `2. 사유별 fix 적용 (메모리 [adsense-rejection-response] 참조)`,
        `3. 1~2주 fix 누적 후 재신청`,
      ].join("\n"),
    };
  }

  // 경고 — READY → WARNING/NEEDS_ATTENTION 전환 (광고 일시 중단 risk).
  if (previous === "READY") {
    return {
      shouldAlert: true,
      subject: `[keepioo] AdSense 경고 (${current})`,
      message: [
        `AdSense 정상 운영 중 경고 감지.`,
        `account.state READY → ${current} 전환.`,
        ``,
        `즉시 https://adsense.google.com 에서 정책 위반·결제 정보 점검 필요.`,
      ].join("\n"),
    };
  }

  // 기타 전환 (예: NEEDS_ATTENTION → WARNING) — 정보 알림.
  return {
    shouldAlert: true,
    subject: `[keepioo] AdSense state 전환 (${current})`,
    message: `account.state ${previous} → ${current} 전환 감지. 검수 진행 신호일 수 있음.`,
  };
}
