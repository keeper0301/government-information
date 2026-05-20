import { describe, expect, it } from "vitest";
import { buildPersonalizationStatusSummary } from "@/lib/admin/personalization-status";

describe("buildPersonalizationStatusSummary", () => {
  it("summarizes recommendation readiness and delivery health", () => {
    const summary = buildPersonalizationStatusSummary({
      profileTotal: 20,
      profileReady: 15,
      activeRules: 12,
      autoRules: 9,
      deliveries24h: 40,
      sent24h: 36,
      failed24h: 3,
      queued24h: 1,
    });

    expect(summary.profileReadyPercent).toBe(75);
    expect(summary.deliveryFailureRate).toBe(8);
    expect(summary.healthLabel).toBe("주의");
    expect(summary.healthTone).toBe("warn");
    expect(summary.cards).toEqual([
      {
        key: "profile-ready",
        label: "추천 준비 프로필",
        value: 15,
        suffix: "명",
        hint: "전체 20명 중 75%",
        tone: "good",
        href: "/admin/recommendation-trace",
      },
      {
        key: "active-rules",
        label: "활성 알림 규칙",
        value: 12,
        suffix: "개",
        hint: "자동 규칙 9개 포함",
        tone: "neutral",
        href: "/admin/alert-simulator",
      },
      {
        key: "sent-24h",
        label: "24h 정책함 도착",
        value: 36,
        suffix: "건",
        hint: "전체 발송 시도 40건",
        tone: "good",
        href: "/admin/alimtalk",
      },
      {
        key: "failed-24h",
        label: "24h 발송 실패",
        value: 3,
        suffix: "건",
        hint: "실패율 8%",
        tone: "warn",
        href: "/admin/alimtalk",
      },
    ]);
  });

  it("marks delivery health dangerous when failures are high", () => {
    const summary = buildPersonalizationStatusSummary({
      profileTotal: 0,
      profileReady: 0,
      activeRules: 0,
      autoRules: 0,
      deliveries24h: 20,
      sent24h: 10,
      failed24h: 6,
      queued24h: 4,
    });

    expect(summary.profileReadyPercent).toBe(0);
    expect(summary.deliveryFailureRate).toBe(30);
    expect(summary.healthLabel).toBe("위험");
    expect(summary.healthTone).toBe("danger");
    expect(summary.cards.find((card) => card.key === "failed-24h")).toMatchObject({
      tone: "danger",
      hint: "실패율 30%",
    });
  });
});
