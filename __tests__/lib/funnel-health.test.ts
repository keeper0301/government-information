import { describe, expect, it } from "vitest";

import {
  buildFunnelMetrics,
  buildFunnelSummary,
  type FunnelHealthCounts,
} from "@/lib/funnel-health";

const BASE_COUNTS: FunnelHealthCounts = {
  signups24h: 10,
  signups7d: 40,
  profileSaves24h: 6,
  profileSaves7d: 24,
  alertRules24h: 3,
  alertRules7d: 12,
  active7d: 18,
};

describe("buildFunnelMetrics", () => {
  it("builds signup, profile, alert, and active-user funnel cards", () => {
    const metrics = buildFunnelMetrics(BASE_COUNTS);

    expect(metrics.map((m) => m.key)).toEqual([
      "signup_completed",
      "profile_saved",
      "alert_rule_created",
      "active_7d",
    ]);
    expect(metrics[1]).toMatchObject({
      key: "profile_saved",
      value24h: 6,
      value7d: 24,
      conversionLabel: "가입 대비",
      conversionRate: 60,
      tone: "ok",
    });
    expect(metrics[2]).toMatchObject({
      key: "alert_rule_created",
      conversionLabel: "프로필 대비",
      conversionRate: 50,
    });
  });

  it("marks conversion rates as unknown when the denominator is zero", () => {
    const metrics = buildFunnelMetrics({
      ...BASE_COUNTS,
      signups24h: 0,
      profileSaves24h: 2,
    });

    expect(metrics[1]).toMatchObject({
      key: "profile_saved",
      conversionRate: null,
      tone: "info",
    });
  });
});

describe("buildFunnelSummary", () => {
  it("flags signup funnel inspection when signups are zero and active users are low", () => {
    expect(
      buildFunnelSummary({
        ...BASE_COUNTS,
        signups24h: 0,
        active7d: 3,
      }),
    ).toMatchObject({
      tone: "warn",
      message: "24h 신규 가입 0명, 7d 활성 3명입니다. 가입 funnel 점검이 필요합니다.",
    });
  });

  it("returns a stable summary when activity is healthy", () => {
    expect(buildFunnelSummary(BASE_COUNTS)).toMatchObject({
      tone: "ok",
      message: "가입 funnel 신호가 정상 범위입니다.",
    });
  });
});
