import { describe, expect, it } from "vitest";
import {
  buildLeadRecommendations,
  parseSnsUtmPerformanceRows,
  summarizeSnsUtmPerformance,
} from "@/lib/analytics/sns-utm-performance";

describe("sns UTM performance", () => {
  it("GA4 rows에서 blog_auto SNS UTM만 집계하고 세션순으로 정렬한다", () => {
    const rows = parseSnsUtmPerformanceRows({
      rows: [
        {
          dimensionValues: [
            { value: "threads" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "lead_1" },
          ],
          metricValues: [{ value: "7" }, { value: "5" }],
        },
        {
          dimensionValues: [
            { value: "threads" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "lead_1" },
          ],
          metricValues: [{ value: "3" }, { value: "2" }],
        },
        {
          dimensionValues: [
            { value: "twitter" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "link" },
          ],
          metricValues: [{ value: "4" }, { value: "4" }],
        },
        {
          dimensionValues: [
            { value: "threads" },
            { value: "referral" },
            { value: "blog_auto" },
            { value: "lead_0" },
          ],
          metricValues: [{ value: "99" }, { value: "99" }],
        },
      ],
    });

    expect(rows).toEqual([
      { source: "threads", content: "lead_1", sessions: 10, activeUsers: 7 },
      { source: "twitter", content: "link", sessions: 4, activeUsers: 4 },
    ]);
  });

  it("요약에서 전체 세션과 현재 1등 lead를 낸다", () => {
    const summary = summarizeSnsUtmPerformance(
      [
        { source: "threads", content: "lead_2", sessions: 6, activeUsers: 5 },
        { source: "facebook", content: "link", sessions: 2, activeUsers: 2 },
      ],
      30,
    );

    expect(summary.ready).toBe(true);
    expect(summary.totals).toEqual({ sessions: 8, activeUsers: 7 });
    expect(summary.bestContent?.content).toBe("lead_2");
  });

  it("GA4 오류가 있으면 ready=false로 콘솔을 깨지 않는다", () => {
    const summary = summarizeSnsUtmPerformance([], 30, "GA4 credentials missing");
    expect(summary.ready).toBe(false);
    expect(summary.error).toContain("GA4 credentials missing");
  });

  it("Threads lead별 유지/중단/관찰 권고를 계산한다", () => {
    const recommendations = buildLeadRecommendations([
      { source: "threads", content: "lead_1", sessions: 14, activeUsers: 10 },
      { source: "threads", content: "lead_0", sessions: 5, activeUsers: 4 },
      { source: "threads", content: "lead_2", sessions: 1, activeUsers: 1 },
      { source: "twitter", content: "link", sessions: 99, activeUsers: 90 },
    ]);

    expect(recommendations).toEqual([
      expect.objectContaining({
        content: "lead_0",
        status: "watch",
        sharePct: 25,
        pauseImpact: expect.objectContaining({ lostSessions: 5, riskLabel: "중간" }),
      }),
      expect.objectContaining({
        content: "lead_1",
        status: "keep",
        sharePct: 70,
        pauseImpact: expect.objectContaining({ lostSessions: 14, lostActiveUsers: 10, riskLabel: "높음" }),
      }),
      expect.objectContaining({
        content: "lead_2",
        status: "pause",
        sharePct: 5,
        pauseImpact: expect.objectContaining({ lostSessions: 1, remainingLeadCount: 2, riskLabel: "중간" }),
      }),
    ]);
  });

  it("표본이 부족하면 lead를 섣불리 죽이지 않는다", () => {
    const recommendations = buildLeadRecommendations([
      { source: "threads", content: "lead_1", sessions: 3, activeUsers: 3 },
    ]);

    expect(recommendations.every((row) => row.status === "needs_data")).toBe(true);
  });
});
