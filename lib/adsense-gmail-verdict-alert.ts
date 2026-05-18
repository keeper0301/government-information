import type { AdSenseEmailVerdict } from "@/lib/external-console/gmail-adsense-watch";

export function buildGmailVerdictAlert(input: {
  verdict: AdSenseEmailVerdict;
  subject: string;
}): { shouldAlert: boolean; subject: string; message: string } | null {
  const { verdict, subject } = input;

  if (verdict === "approved") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 승인 🎉",
      message: [
        `AdSense 이메일 도착 — 승인 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com 에서 publisher ID 확인`,
        `2. Vercel env 등록: ADSENSE_PUBLISHER_ID`,
        `3. adsense-review-watch cron 이 state=READY 자동 감지 (10:05)`,
      ].join("\n"),
    };
  }

  if (verdict === "rejected") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 거절",
      message: [
        `AdSense 이메일 도착 — 거절 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `[다음 액션]`,
        `1. https://adsense.google.com → 거절 사유 확인`,
        `2. 메모리 [adsense-rejection-response] 따라 사유별 fix`,
        `3. 1~2주 fix 누적 후 재신청`,
      ].join("\n"),
    };
  }

  if (verdict === "violation") {
    return {
      shouldAlert: true,
      subject: "[keepioo] AdSense 이메일: 정책 위반 경고",
      message: [
        `AdSense 이메일 도착 — 정책 위반·경고 키워드 매칭.`,
        `Subject: ${subject.slice(0, 80)}`,
        ``,
        `즉시 https://adsense.google.com 에서 위반 항목 확인 + fix.`,
      ].join("\n"),
    };
  }

  return null;
}
