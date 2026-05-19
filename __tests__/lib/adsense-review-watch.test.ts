import { describe, expect, it } from "vitest";
import { buildTransitionAlert } from "@/lib/adsense-review-watch";

describe("buildTransitionAlert", () => {
  it("첫 가동 (previous=null) + NEEDS_ATTENTION → audit baseline 만, alert 없음", () => {
    expect(
      buildTransitionAlert({ previous: null, current: "NEEDS_ATTENTION" }),
    ).toBeNull();
  });

  it("2026-05-19 fix — 첫 가동 (previous=null) + state=READY → 즉시 승인 알림", () => {
    const r = buildTransitionAlert({ previous: null, current: "READY" });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("승인 통과");
    expect(r?.subject).toContain("첫 감지");
    expect(r?.message).toContain("NEXT_PUBLIC_ADSENSE_ID");
    expect(r?.message).toContain("Vercel env");
  });

  it("동일 state 는 noop (매일 폭주 차단)", () => {
    expect(
      buildTransitionAlert({ previous: "NEEDS_ATTENTION", current: "NEEDS_ATTENTION" }),
    ).toBeNull();
  });

  it("NEEDS_ATTENTION → READY = 승인 메시지 + 다음 액션 4단계", () => {
    const r = buildTransitionAlert({ previous: "NEEDS_ATTENTION", current: "READY" });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("승인 통과");
    expect(r?.message).toContain("ADSENSE_PUBLISHER_ID");
    expect(r?.message).toContain("ads.txt");
  });

  it("NEEDS_ATTENTION → DISABLED = 거절 메시지 + 사유 확인 가이드", () => {
    const r = buildTransitionAlert({ previous: "NEEDS_ATTENTION", current: "DISABLED" });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("거절");
    expect(r?.subject).toContain("DISABLED");
    expect(r?.message).toContain("adsense.google.com");
  });

  it("READY → WARNING = 광고 일시 중단 경고", () => {
    const r = buildTransitionAlert({ previous: "READY", current: "WARNING" });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("경고");
    expect(r?.message).toContain("READY → WARNING");
  });

  it("NEEDS_ATTENTION → WARNING = 기타 전환 정보 알림", () => {
    const r = buildTransitionAlert({ previous: "NEEDS_ATTENTION", current: "WARNING" });
    expect(r?.shouldAlert).toBe(true);
    expect(r?.subject).toContain("state 전환");
  });
});
