import { describe, expect, it } from "vitest";
import { classifyAdsenseEmail } from "@/lib/external-console/gmail-adsense-watch";
import { buildGmailVerdictAlert } from "@/app/api/cron/adsense-gmail-watch/route";

describe("classifyAdsenseEmail", () => {
  it("한국어 '승인' → approved", () => {
    expect(
      classifyAdsenseEmail({
        subject: "AdSense 사이트가 승인되었습니다",
        snippet: "축하합니다. 광고 게재가 시작됩니다.",
      }),
    ).toBe("approved");
  });

  it("영어 'approved' → approved", () => {
    expect(
      classifyAdsenseEmail({
        subject: "Your AdSense account has been approved",
        snippet: "Welcome to AdSense",
      }),
    ).toBe("approved");
  });

  it("한국어 '거절' → rejected", () => {
    expect(
      classifyAdsenseEmail({
        subject: "AdSense 검토 결과: 거절",
        snippet: "가치가 별로 없는 콘텐츠",
      }),
    ).toBe("rejected");
  });

  it("영어 'not approved' → rejected", () => {
    expect(
      classifyAdsenseEmail({
        subject: "Your AdSense application was not approved",
        snippet: "Site does not meet criteria",
      }),
    ).toBe("rejected");
  });

  it("'정책 위반' → violation", () => {
    expect(
      classifyAdsenseEmail({
        subject: "정책 위반 경고 — keepioo.com",
        snippet: "광고 일시 중단",
      }),
    ).toBe("violation");
  });

  it("일반 AdSense 알림 (수익 보고서) → info", () => {
    expect(
      classifyAdsenseEmail({
        subject: "AdSense 월간 수익 보고서",
        snippet: "5월 수익 요약",
      }),
    ).toBe("info");
  });

  it("AdSense 관련 없는 발신 → unmatched", () => {
    expect(
      classifyAdsenseEmail({
        subject: "Google Cloud Console 빌링",
        snippet: "5월 청구",
      }),
    ).toBe("unmatched");
  });

  it("승인 + 거절 동시 매칭 시 거절 우선 (false positive 차단)", () => {
    expect(
      classifyAdsenseEmail({
        subject: "AdSense 승인 결과",
        snippet: "안타깝게도 거절되었습니다",
      }),
    ).toBe("rejected");
  });
});

describe("buildGmailVerdictAlert", () => {
  it("approved → 승인 메시지 + 3 단계 액션", () => {
    const r = buildGmailVerdictAlert({
      verdict: "approved",
      subject: "AdSense 승인",
    });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("승인");
    expect(r?.message).toContain("ADSENSE_PUBLISHER_ID");
    expect(r?.message).toContain("publisher ID");
  });

  it("rejected → 거절 메시지 + 메모리 참조", () => {
    const r = buildGmailVerdictAlert({
      verdict: "rejected",
      subject: "AdSense 거절",
    });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("거절");
    expect(r?.message).toContain("adsense-rejection-response");
  });

  it("violation → 경고 메시지", () => {
    const r = buildGmailVerdictAlert({
      verdict: "violation",
      subject: "정책 위반",
    });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("정책 위반");
  });

  it("info → 알림 없음 (월간 보고서 등 무음)", () => {
    expect(
      buildGmailVerdictAlert({ verdict: "info", subject: "수익 보고서" }),
    ).toBeNull();
  });

  it("unmatched → 알림 없음", () => {
    expect(
      buildGmailVerdictAlert({ verdict: "unmatched", subject: "기타" }),
    ).toBeNull();
  });
});
