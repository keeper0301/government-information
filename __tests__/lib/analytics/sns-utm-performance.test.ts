import { describe, expect, it } from "vitest";
import {
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
});
